import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { CommandBase } from './command.base.mjs';
import { isAbsolutePath, sanitizeFilename } from '../utils/paths.util.mjs';

/**
 * Onboarding command. Scans a project directory against detection
 * profiles, lets the user review the protected list, and writes a
 * project config. Prompts are read via node:readline and always closed.
 * Init is interactive and text-only, so it depends on the concrete
 * TextOutput rather than the Output interface.
 */
export class InitCommand extends CommandBase {
  /**
   * @param {ConfigLoader} configLoader - loads and writes project configs
   * @param {HashStore} hashStore - computes and persists file hashes
   * @param {FileLock} fileLock - sets, removes, and checks read-only flags
   * @param {TextOutput} output - all console and file output
   * @param {Scanner} scanner - detects known config files in the project
   */
  constructor(configLoader, hashStore, fileLock, output, scanner) {
    super(configLoader, hashStore, fileLock, output);
    this._scanner = scanner;
  }

  /**
   * Initialize a project: resolve its path, scan it, prompt the user,
   * and write the config file.
   * @param {string[]} args - positional args; exactly one project path
   */
  async execute(args) {
    if (args.length !== 1) {
      throw new Error('Project path required. Usage: node guard.mjs init <path>');
    }
    const root = this._resolveProjectPath(args[0]);
    this._assertProjectExists(root);
    const name = this._deriveName(root);
    if (await this._promptOverwrite(name)) {
      return;
    }
    const matches = this._scanner.scan(root);
    const suggestions = this._scanner.suggestFolderPatterns(matches);
    this._output.renderInitResults(this._groupByProfile(matches), suggestions);
    const patterns = await this._choosePatterns(matches);
    if (patterns === null) {
      return;
    }
    this._configLoader.write(name, { name, root, protected: patterns });
    this._output.renderMessage(
      `Config written: configs/${name}.json. Next step: node guard.mjs capture ${name}`
    );
  }

  /**
   * Resolve a possibly-relative project path to an absolute path.
   * This is the ONLY place process.cwd() is used in the whole tool.
   * @param {string} projectPath - path given on the command line
   * @returns {string} absolute project path
   */
  _resolveProjectPath(projectPath) {
    if (isAbsolutePath(projectPath)) {
      return projectPath;
    }
    return resolve(process.cwd(), projectPath);
  }

  /**
   * Throw a clear error when the project directory does not exist.
   * @param {string} root - absolute project path
   */
  _assertProjectExists(root) {
    if (!existsSync(root)) {
      throw new Error(`Project path not found: ${root}`);
    }
  }

  /**
   * Derive the config name from the project folder name.
   * @param {string} root - absolute project path
   * @returns {string} sanitized config name
   */
  _deriveName(root) {
    return sanitizeFilename(basename(root));
  }

  /**
   * Load an existing config, or detect whether the file exists at all.
   * ConfigLoader.load throws "Config not found" only when the file is
   * absent; any other load error still means the file exists.
   * @param {string} name - config name
   * @returns {{ config: object|null, exists: boolean }}
   */
  _existingConfig(name) {
    try {
      return { config: this._configLoader.load(name), exists: true };
    } catch (error) {
      if (String(error.message).startsWith('Config not found:')) {
        return { config: null, exists: false };
      }
      return { config: null, exists: true };
    }
  }

  /**
   * Ask whether to overwrite an existing config. Returns true when the
   * run should abort (user answered no).
   * @param {string} name - config name
   * @returns {Promise<boolean>} true when the user aborted
   */
  async _promptOverwrite(name) {
    const { config, exists } = this._existingConfig(name);
    if (!exists) {
      return false;
    }
    const answer = await this._ask(
      `Config already exists: configs/${name}.json. Overwrite? [Y/n]`
    );
    if (answer.trim().toLowerCase() === 'n') {
      this._output.renderMessage('Aborted.');
      process.exitCode = 0;
      return true;
    }
    if (config && this._fileLock.isLocked(config.configPath)) {
      this._fileLock.unlock(config.configPath);
    }
    return false;
  }

  /**
   * Ask the user whether to protect the detected files. Supports an
   * interactive edit mode. Returns null when the user aborts.
   * @param {object[]} matches - scan results from Scanner.scan
   * @returns {Promise<string[]|null>} protected patterns or null
   */
  async _choosePatterns(matches) {
    const patterns = matches.map((match) => match.matchedPath);
    const answer = await this._ask(
      `Protect these ${patterns.length} files? [Y/n/edit]`
    );
    const choice = answer.trim().toLowerCase();
    if (choice === 'n') {
      this._output.renderMessage('Aborted. No config written.');
      process.exitCode = 0;
      return null;
    }
    if (choice === 'edit') {
      return this._editPatterns(patterns);
    }
    return patterns;
  }

  /**
   * Interactive edit loop: `remove <n>`, `add <pattern>`, `done`.
   * The numbered list is printed once before reading commands.
   * @param {string[]} patterns - initial protected patterns
   * @returns {Promise<string[]>} edited patterns
   */
  _editPatterns(patterns) {
    const working = [...patterns];
    this._printNumberedList(working);
    return new Promise((resolvePromise) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.on('line', (line) => {
        const done = this._applyEditCommand(line, working);
        if (done) {
          rl.close();
        } else {
          rl.prompt();
        }
      });
      rl.on('close', () => resolvePromise([...working]));
      rl.prompt();
    });
  }

  /**
   * Apply one edit command. Returns true when the loop should end.
   * @param {string} line - raw input line
   * @param {string[]} working - patterns currently being edited
   * @returns {boolean} true for the `done` command
   */
  _applyEditCommand(line, working) {
    const trimmed = line.trim();
    if (trimmed === 'done') {
      return true;
    }
    const removeMatch = trimmed.match(/^remove\s+(\d+)$/i);
    if (removeMatch) {
      const index = Number(removeMatch[1]);
      if (index >= 1 && index <= working.length) {
        working.splice(index - 1, 1);
        return false;
      }
    }
    const addMatch = trimmed.match(/^add\s+(.+)$/i);
    if (addMatch) {
      const pattern = addMatch[1].trim();
      if (pattern !== '') {
        working.push(pattern);
        return false;
      }
    }
    this._output.renderMessage('Unknown command. Use: remove <n>, add <pattern>, done');
    return false;
  }

  /**
   * Print the protected patterns as a numbered list.
   * @param {string[]} patterns - patterns to list
   */
  _printNumberedList(patterns) {
    patterns.forEach((pattern, index) => {
      this._output.renderMessage(`${index + 1}. ${pattern}`);
    });
  }

  /**
   * Group scan matches by detection profile.
   * @param {object[]} matches - scan results from Scanner.scan
   * @returns {Object<string, string[]>} profile name → matched paths
   */
  _groupByProfile(matches) {
    const grouped = {};
    for (const match of matches) {
      if (!grouped[match.profile]) {
        grouped[match.profile] = [];
      }
      grouped[match.profile].push(match.matchedPath);
    }
    return grouped;
  }

  /**
   * Prompt the user with readline and resolve with the raw answer.
   * The readline interface is always closed.
   * @param {string} question - prompt text
   * @returns {Promise<string>} raw user answer
   */
  _ask(question) {
    return new Promise((resolvePromise) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.question(question, (answer) => {
        rl.close();
        resolvePromise(answer);
      });
    });
  }
}