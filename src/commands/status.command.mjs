import { CommandBase } from './command.base.mjs';
import { StatusResult } from '../models/status-result.model.mjs';

/**
 * Status command. Reports lock state and hash-store metadata without
 * re-hashing any file — a cheap "are my files locked right now?" query.
 */
export class StatusCommand extends CommandBase {
  /**
   * Report the status of a named project.
   * @param {string[]} args - positional args; exactly one project name
   * @returns {Promise<StatusResult>} the computed status result
   */
  async execute(args) {
    if (args.length !== 1) {
      throw new Error('Project name required. Usage: node guard.mjs status <name>');
    }
    const name = args[0];
    const config = this._configLoader.load(name);
    const store = this._hashStore.load(name);
    const configLocked = this._fileLock.isLocked(config.configPath);
    const lastCapturedAt = store ? store.captured : null;
    const fileCount = store && store.files ? Object.keys(store.files).length : 0;
    const statusResult = new StatusResult(
      config.name,
      name,
      config.root,
      configLocked,
      lastCapturedAt,
      config.protected,
      fileCount
    );
    this._output.renderStatusResult(statusResult);
    process.exitCode = 0;
    return statusResult;
  }
}