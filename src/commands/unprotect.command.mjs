import { CommandBase } from './command.base.mjs';

/**
 * Unprotect command. Removes a single pattern from a project's protected
 * list and rewrites the config atomically. Orphaned hash-store entries
 * are harmless (check only expands config.protected), so the hash store
 * is left untouched.
 */
export class UnprotectCommand extends CommandBase {
  /**
   * Remove a pattern from the protected list of a named project.
   * @param {string[]} args - positional args; project name and pattern
   */
  async execute(args) {
    if (args.length !== 2) {
      throw new Error('Usage: node guard.mjs unprotect <name> <pattern>');
    }
    const [name, pattern] = args;
    const config = this._configLoader.load(name);
    const remaining = config.protected.filter((item) => item !== pattern);
    if (remaining.length === config.protected.length) {
      this._output.renderMessage(`Pattern not in config: ${pattern}`);
      process.exitCode = 0;
      return;
    }
    if (remaining.length === 0) {
      throw new Error(
        `Cannot remove the last protected pattern from ${name}. ` +
          'A config must protect at least one pattern.'
      );
    }
    this._configLoader.write(name, {
      name: config.name,
      root: config.root,
      protected: remaining,
    });
    this._output.renderMessage(`Removed pattern: ${pattern}`);
    this._output.renderMessage(
      `Re-run capture to update protected files: node guard.mjs capture ${name}`
    );
    process.exitCode = 0;
  }
}