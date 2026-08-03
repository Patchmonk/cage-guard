import { createInterface } from 'node:readline';

import { CommandBase } from './command.base.mjs';
import { expandPatterns } from '../utils/paths.util.mjs';

/**
 * Menu command. Interactive project hub: lists configured projects, lets
 * the user pick one, and delegates to capture/unlock/check/status. The
 * delegated commands are injected, never constructed here. All prompting
 * flows through a single `_ask` helper so decision logic stays pure and
 * testable.
 */
export class MenuCommand extends CommandBase {
  /**
   * @param {ConfigLoader} configLoader - loads, lists, and writes project configs
   * @param {HashStore} hashStore - computes and persists file hashes
   * @param {FileLock} fileLock - sets, removes, and checks read-only flags
   * @param {Output} output - all console and file output
   * @param {object} commands - already-constructed commands to delegate to
   * @param {CaptureCommand} commands.capture
   * @param {UnlockCommand} commands.unlock
   * @param {CheckCommand} commands.check
   * @param {StatusCommand} commands.status
   */
  constructor(configLoader, hashStore, fileLock, output, commands) {
    super(configLoader, hashStore, fileLock, output);
    this._commands = commands;
  }

  /**
   * Run the interactive project hub. With no projects it shows onboarding
   * and exits cleanly; with one it goes straight to the action menu; with
   * several it shows the picker first.
   * @param {string[]} args - positional args; must be empty
   */
  async execute(args) {
    if (args.length > 0) {
      throw new Error('Usage: node guard.mjs menu');
    }
    this._rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const names = this._configLoader.listAll();
      if (names.length === 0) {
        this._output.renderMessage(
          'No projects exist yet. Run: node guard.mjs init <path>'
        );
        process.exitCode = 0;
        return;
      }
      if (names.length === 1) {
        await this._actionLoop(names[0], true);
        return;
      }
      while (true) {
        const selected = await this._selectProject(names);
        if (selected === null) {
          process.exitCode = 0;
          return;
        }
        const result = await this._actionLoop(selected, false);
        if (result === 'exit') {
          process.exitCode = 0;
          return;
        }
      }
    } finally {
      this._rl.close();
      this._rl = null;
    }
  }

  /**
   * Show the project picker and prompt until a valid selection or quit.
   * The picker is rendered once per visit; invalid answers re-prompt.
   * @param {string[]} names - all config names
   * @returns {Promise<string|null>} selected name, or null on quit
   */
  async _selectProject(names) {
    const entries = names.map((name) => this._buildEntry(name));
    this._output.renderProjectPicker(entries);
    while (true) {
      const answer = await this._ask('> ');
      const choice = answer.trim().toLowerCase();
      if (choice === 'q') {
        return null;
      }
      const selected = this._resolveSelection(names, answer);
      if (selected !== null) {
        return selected;
      }
      this._output.renderMessage('Invalid selection. Try again.');
    }
  }

  /**
   * Show the action menu for one project and dispatch the chosen action.
   * Loops until the user goes back or quits. In single-project mode the
   * back action exits the tool instead of returning to a picker.
   * @param {string} name - selected config name
   * @param {boolean} single - true when this is the only project (B exits)
   * @returns {Promise<string>} 'exit' to leave the tool, 'back' to re-show the picker
   */
  async _actionLoop(name, single) {
    while (true) {
      const entry = this._buildEntry(name);
      this._output.renderActionMenu(entry);
      const answer = await this._ask('Action (1-4, B, Q): ');
      const choice = answer.trim().toLowerCase();
      if (choice === '1') {
        if (await this._confirm('Lock (capture) all protected files? [Y/n]')) {
          await this._commands.capture.execute([name]);
        }
      } else if (choice === '2') {
        if (await this._confirm('Unlock all protected files? [Y/n]')) {
          await this._commands.unlock.execute([name]);
        }
      } else if (choice === '3') {
        await this._commands.check.execute([name]);
      } else if (choice === '4') {
        await this._commands.status.execute([name]);
      } else if (choice === 'b') {
        return single ? 'exit' : 'back';
      } else if (choice === 'q') {
        return 'exit';
      } else {
        this._output.renderMessage('Invalid choice. Try again.');
      }
    }
  }

  /**
   * Ask a yes/no confirmation. Only a literal 'n' declines.
   * @param {string} question - confirmation prompt text
   * @returns {Promise<boolean>} true when the user confirmed
   */
  async _confirm(question) {
    const answer = await this._ask(question);
    return answer.trim().toLowerCase() !== 'n';
  }

  /**
   * Build a picker entry for one project. Any load or expansion failure is
   * captured in the entry's error field so a broken project never kills
   * the hub. Pure with respect to the injected dependencies.
   * @param {string} name - config name
   * @returns {{ name: string, fileCount: number, lockedCount: number, hasStore: boolean, error: string|null }}
   */
  _buildEntry(name) {
    try {
      const config = this._configLoader.load(name);
      const store = this._hashStore.load(name);
      const fileCount = store && store.files ? Object.keys(store.files).length : 0;
      const { paths } = expandPatterns(config.root, config.protected);
      const lockedCount = paths.filter((p) => this._fileLock.isLocked(p)).length;
      return {
        name,
        fileCount,
        lockedCount,
        hasStore: store !== null,
        error: null,
      };
    } catch (error) {
      return { name, error: error.message };
    }
  }

  /**
   * Maps a user answer to a config name: a number is a 1-based list index,
   * anything else is matched as an exact config name.
   * @param {string[]} names - all config names
   * @param {string} answer - raw user answer
   * @returns {string|null} selected name, or null when invalid
   */
  _resolveSelection(names, answer) {
    const trimmed = answer.trim();
    if (trimmed === '') {
      return null;
    }
    if (/^\d+$/.test(trimmed)) {
      const index = Number(trimmed);
      if (index < 1 || index > names.length) {
        return null;
      }
      return names[index - 1];
    }
    if (names.includes(trimmed)) {
      return trimmed;
    }
    return null;
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