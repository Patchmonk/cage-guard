/**
 * Abstract base class for all commands.
 * Every command receives its dependencies through constructor injection
 * and exposes a single polymorphic `execute(args)` entry point. Each
 * concrete command validates its own arity and throws a descriptive
 * usage error — dispatch never branches on command type.
 */
export class CommandBase {
  /**
   * @param {ConfigLoader} configLoader - loads, lists, and writes project configs
   * @param {HashStore} hashStore - computes and persists file hashes
   * @param {FileLock} fileLock - sets, removes, and checks read-only flags
   * @param {Output} output - all console and file output
   */
  constructor(configLoader, hashStore, fileLock, output) {
    this._configLoader = configLoader;
    this._hashStore = hashStore;
    this._fileLock = fileLock;
    this._output = output;
  }

  /**
   * Execute the command with positional arguments.
   * @param {string[]} args - positional command arguments
   */
  async execute(args) {
    throw new Error('not implemented');
  }
}