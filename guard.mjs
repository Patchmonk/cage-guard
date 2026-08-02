import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const TOOL_ROOT = dirname(__filename);
const CONFIGS_DIR = join(TOOL_ROOT, 'configs');
const HASHES_DIR = join(TOOL_ROOT, 'hashes');
const REPORTS_DIR = join(TOOL_ROOT, 'reports');

import { createInterface } from 'node:readline';

import { ConfigLoader } from './src/services/config-loader.service.mjs';
import { HashStore } from './src/services/hash-store.service.mjs';
import { FileLock } from './src/services/file-lock.service.mjs';
import { Report } from './src/services/report.service.mjs';
import { Scanner } from './src/services/scanner.service.mjs';
import { InitCommand } from './src/commands/init.command.mjs';
import { CaptureCommand } from './src/commands/capture.command.mjs';
import { CheckCommand } from './src/commands/check.command.mjs';
import { ensureDirectories } from './src/utils/paths.util.mjs';

/**
 * Entry point. Creates tool directories, instantiates services and
 * commands, validates CLI arguments, and dispatches to the right command.
 */
async function main() {
  ensureDirectories(TOOL_ROOT);
  const configLoader = new ConfigLoader(CONFIGS_DIR);
  const fileLock = new FileLock();
  const hashStore = new HashStore(HASHES_DIR, fileLock);
  const report = new Report(REPORTS_DIR);
  const scanner = new Scanner();
  const initCommand = new InitCommand(configLoader, hashStore, fileLock, report, scanner);
  const captureCommand = new CaptureCommand(configLoader, hashStore, fileLock, report);
  const checkCommand = new CheckCommand(configLoader, hashStore, fileLock, report);
  const commandMap = new Map([
    ['init', initCommand],
    ['capture', captureCommand],
    ['check', checkCommand],
  ]);
  await run(commandMap, configLoader, process.argv[2], process.argv[3]);
}

/**
 * Validates the CLI command and argument, then dispatches.
 * @param {Map<string, object>} commandMap
 * @param {object} configLoader
 * @param {string|undefined} cmd
 * @param {string|undefined} arg
 */
async function run(commandMap, configLoader, cmd, arg) {
  if (cmd === 'init') {
    if (!arg) {
      throw new Error('Project path required. Usage: node guard.mjs init <path>');
    }
    await commandMap.get('init').execute(arg);
    return;
  }
  if (cmd === 'capture') {
    if (!arg) {
      throw new Error('Project name required. Usage: node guard.mjs capture <name>');
    }
    await commandMap.get('capture').execute(arg);
    return;
  }
  if (cmd === 'check') {
    if (!arg) {
      await commandMap.get('check').executeAll();
    } else {
      await commandMap.get('check').execute(arg);
    }
    return;
  }
  if (cmd === undefined) {
    await runInteractive(commandMap, configLoader);
    return;
  }
  throw new Error(`Unknown command: ${cmd}. Available: init, capture, check.`);
}

/**
 * Interactive mode: list available configs and let the user pick one.
 * @param {Map<string, object>} commandMap
 * @param {object} configLoader
 */
async function runInteractive(commandMap, configLoader) {
  const names = configLoader.listAll();
  if (names.length === 0) {
    throw new Error('No configs found in configs/. Run init first.');
  }
  printProjectList(names);
  if (!process.stdin.isTTY) {
    throw new Error('Run interactively or specify a project name.');
  }
  const selected = await promptSelection(names);
  await commandMap.get('check').execute(selected);
}

/**
 * Prompts the user to select a project via readline.
 * @param {string[]} names
 * @returns {Promise<string>}
 */
function promptSelection(names) {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Select project: ', (answer) => {
      rl.close();
      const selected = resolveSelection(names, answer);
      if (selected === null) {
        reject(new Error('Invalid selection.'));
        return;
      }
      resolve(selected);
    });
  });
}

/**
 * Maps a user answer to a config name: a number is a 1-based list index,
 * anything else is matched as a config name.
 * @param {string[]} names
 * @param {string} answer
 * @returns {string|null}
 */
function resolveSelection(names, answer) {
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
 * Prints the numbered list of available project configs.
 * @param {string[]} names
 */
function printProjectList(names) {
  names.forEach((name, index) => {
    process.stdout.write(`${index + 1}. ${name}\n`);
  });
}

try {
  await main();
} catch (error) {
  process.stderr.write(error.message + '\n');
  process.exit(1);
}
