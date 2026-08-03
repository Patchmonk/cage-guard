import { CommandBase } from './command.base.mjs';
import { expandPatterns } from '../utils/paths.util.mjs';

/**
 * Unlock command. Removes the read-only flag from every protected file
 * and the config so the human can edit them (the daily friction point).
 * Re-lock with `capture`, which re-hashes and re-locks everything.
 */
export class UnlockCommand extends CommandBase {
  /**
   * Unlock the protected files and config of a named project.
   * @param {string[]} args - positional args; exactly one project name
   */
  async execute(args) {
    if (args.length !== 1) {
      throw new Error('Project name required. Usage: node guard.mjs unlock <name>');
    }
    const name = args[0];
    const config = this._configLoader.load(name);
    const { paths } = expandPatterns(config.root, config.protected);
    let unlocked = 0;
    for (const absPath of paths) {
      if (this._fileLock.isLocked(absPath)) {
        this._fileLock.unlock(absPath);
        unlocked += 1;
      }
    }
    if (this._fileLock.isLocked(config.configPath)) {
      this._fileLock.unlock(config.configPath);
    }
    this._output.renderMessage(
      `Unlocked ${unlocked} protected file(s) and the config for ${name}.`
    );
    this._output.renderMessage(
      `Edit files, then re-lock with: node guard.mjs capture ${name}`
    );
    process.exitCode = 0;
  }
}