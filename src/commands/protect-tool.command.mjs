import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import { CommandBase } from './command.base.mjs';

/**
 * ProtectTool command. Locks or unlocks the tool's own source files —
 * guard.mjs, everything under src/, and everything under configs/ —
 * replacing the old protect-tool.bat attrib-based script. Never shells
 * out to attrib: all lock/unlock flows through the injected FileLock
 * (chmodSync-based). hashes/ and reports/ are never touched.
 */
export class ProtectToolCommand extends CommandBase {
  /**
   * @param {ConfigLoader} configLoader - loads, lists, and writes project configs
   * @param {HashStore} hashStore - computes and persists file hashes
   * @param {FileLock} fileLock - sets, removes, and checks read-only flags
   * @param {TextOutput} output - all console and file output
   * @param {string} toolRoot - absolute path to the tool's own directory
   */
  constructor(configLoader, hashStore, fileLock, output, toolRoot) {
    super(configLoader, hashStore, fileLock, output);
    this._toolRoot = toolRoot;
  }

  /**
   * Lock or unlock the tool's own source. Accepts an optional `lock` or
   * `unlock` positional; with no args the action is chosen interactively.
   * A missing guard.mjs or empty src/configs is handled gracefully (0
   * files, no crash).
   * @param {string[]} args - positional args; zero, or exactly one of lock|unlock
   */
  async execute(args) {
    this._rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const action = await this._resolveAction(args);
      if (action === null) {
        process.exitCode = 0;
        return;
      }
      const toolFiles = this._collectToolFiles(this._toolRoot);
      const { success, failedPaths } = this._applyAction(action, toolFiles);
      this._output.renderToolProtectResult(action, success, failedPaths);
      process.exitCode = 0;
    } finally {
      this._rl.close();
      this._rl = null;
    }
  }

  /**
   * Resolve the lock/unlock action from the positionals, or prompt when
   * no args were given. Returns null when the user quits the prompt.
   * @param {string[]} args - positional args
   * @returns {Promise<string|null>} 'LOCK', 'UNLOCK', or null on quit
   */
  async _resolveAction(args) {
    if (args.length === 0) {
      return this._askAction();
    }
    if (args.length !== 1) {
      throw new Error('Usage: node guard.mjs protect-tool [lock|unlock]');
    }
    const choice = args[0].toLowerCase();
    if (choice === 'lock') {
      return 'LOCK';
    }
    if (choice === 'unlock') {
      return 'UNLOCK';
    }
    throw new Error('Usage: node guard.mjs protect-tool [lock|unlock]');
  }

  /**
   * Interactive action prompt. Loops until the user picks lock, unlock,
   * or quit — invalid answers re-prompt and never crash.
   * @returns {Promise<string|null>} 'LOCK', 'UNLOCK', or null on quit
   */
  async _askAction() {
    while (true) {
      const answer = await this._ask('[L]ock or [U]nlock or (Q)uit: ');
      const choice = answer.trim().toLowerCase();
      if (choice === 'l' || choice === 'lock') {
        return 'LOCK';
      }
      if (choice === 'u' || choice === 'unlock') {
        return 'UNLOCK';
      }
      if (choice === 'q' || choice === 'quit') {
        return null;
      }
      this._output.renderMessage('Invalid choice. Try again.');
    }
  }

  /**
   * Collect absolute paths of the tool's own source files: guard.mjs, all
   * files under src/ (recursive), and all files under configs/ (recursive).
   * hashes/ and reports/ are never visited. Missing files or directories
   * are skipped — the result is simply smaller.
   * @param {string} toolRoot - absolute tool directory
   * @returns {string[]} absolute file paths
   */
  _collectToolFiles(toolRoot) {
    const files = [];
    const guardPath = join(toolRoot, 'guard.mjs');
    if (existsSync(guardPath)) {
      files.push(guardPath);
    }
    this._collectDir(join(toolRoot, 'src'), files);
    this._collectDir(join(toolRoot, 'configs'), files);
    return files;
  }

  /**
   * Recursively append every file under a directory to the list.
   * Directories themselves are skipped; missing directories are ignored.
   * @param {string} dir - absolute directory path
   * @param {string[]} files - accumulator of absolute file paths
   */
  _collectDir(dir, files) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const absPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        this._collectDir(absPath, files);
      } else if (entry.isFile()) {
        files.push(absPath);
      }
    }
  }

  /**
   * Apply the action to every file. Successes are counted; failures are
   * collected as paths for the result renderer.
   * @param {string} action - 'LOCK' or 'UNLOCK'
   * @param {string[]} toolFiles - absolute file paths
   * @returns {{ success: number, failedPaths: string[] }}
   */
  _applyAction(action, toolFiles) {
    const failedPaths = [];
    let success = 0;
    for (const filePath of toolFiles) {
      const ok =
        action === 'LOCK'
          ? this._fileLock.lock(filePath)
          : this._fileLock.unlock(filePath);
      if (ok) {
        success += 1;
      } else {
        failedPaths.push(filePath);
      }
    }
    return { success, failedPaths };
  }

  /**
   * Prompt the user with the shared readline interface and resolve with
   * the raw answer. A single interface is created once in execute() and
   * closed in its finally block; creating a fresh interface per prompt on
   * the same stdin is unreliable (closed interfaces break later prompts).
   * @param {string} question - prompt text
   * @returns {Promise<string>} raw user answer
   */
  _ask(question) {
    return new Promise((resolvePromise) => {
      this._rl.question(question, (answer) => {
        resolvePromise(answer);
      });
    });
  }
}