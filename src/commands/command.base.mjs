/**
 * Abstract base class for all commands.
 * Every command receives its dependencies through constructor injection.
 */
export class CommandBase {
  /**
   * @param {ConfigLoader} configLoader - loads, lists, and writes project configs
   * @param {HashStore} hashStore - computes and persists file hashes
   * @param {FileLock} fileLock - sets, removes, and checks read-only flags
   * @param {Report} report - all console and file output
   */
  constructor(configLoader, hashStore, fileLock, report) {
    this._configLoader = configLoader;
    this._hashStore = hashStore;
    this._fileLock = fileLock;
    this._report = report;
  }

  /**
   * Execute the command for a named project.
   * @param {string} name - config filename without extension
   */
  async execute(name) {
    throw new Error('not implemented');
  }
}
