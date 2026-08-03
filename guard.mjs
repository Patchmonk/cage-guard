import { fileURLToPath, pathToFileURL } from 'node:url';
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
import { Scanner } from './src/services/scanner.service.mjs';
import { TextOutput } from './src/output/text.output.mjs';
import { JsonOutput } from './src/output/json.output.mjs';
import { InitCommand } from './src/commands/init.command.mjs';
import { CaptureCommand } from './src/commands/capture.command.mjs';
import { CheckCommand } from './src/commands/check.command.mjs';
import { StatusCommand } from './src/commands/status.command.mjs';
import { UnlockCommand } from './src/commands/unlock.command.mjs';
import { UnprotectCommand } from './src/commands/unprotect.command.mjs';
import { ensureDirectories } from './src/utils/paths.util.mjs';

/**
 * Entry point. Creates tool directories, instantiates services and
 * commands, selects the output strategy, and dispatches to the command
 * named by the first positional argument.
 */
async function main() {
  ensureDirectories(TOOL_ROOT);
  const { flags, positionals } = parseArgv(process.argv.slice(2));
  const json = flags.includes('json');
  const fileLock = new FileLock();
  const configLoader = new ConfigLoader(CONFIGS_DIR, fileLock);
  const hashStore = new HashStore(HASHES_DIR, fileLock);
  const scanner = new Scanner();
  const textOutput = new TextOutput(REPORTS_DIR);
  const output = json ? new JsonOutput() : textOutput;
  const initCommand = new InitCommand(configLoader, hashStore, fileLock, textOutput, scanner);
  const captureCommand = new CaptureCommand(configLoader, hashStore, fileLock, output);
  const checkCommand = new CheckCommand(configLoader, hashStore, fileLock, output);
  const statusCommand = new StatusCommand(configLoader, hashStore, fileLock, output);
  const unlockCommand = new UnlockCommand(configLoader, hashStore, fileLock, output);
  const unprotectCommand = new UnprotectCommand(configLoader, hashStore, fileLock, output);
  const commandMap = new Map([
    ['init', initCommand],
    ['capture', captureCommand],
    ['check', checkCommand],
    ['status', statusCommand],
    ['unlock', unlockCommand],
    ['unprotect', unprotectCommand],
  ]);
  await run(commandMap, configLoader, positionals);
}

/**
 * Split raw argv into flags (tokens starting with --) and positionals.
 * Data-driven: supports flags in any position and future flags without
 * any conditional dispatch.
 * @param {string[]} argv - raw process arguments
 * @returns {{ flags: string[], positionals: string[] }}
 */
export function parseArgv(argv) {
  const flags = [];
  const positionals = [];
  for (const token of argv) {
    if (token.startsWith('--')) {
      flags.push(token.slice(2));
    } else {
      positionals.push(token);
    }
  }
  return { flags, positionals };
}

/**
 * Dispatch to the command named by the first positional argument.
 * @param {Map<string, object>} commandMap
 * @param {ConfigLoader} configLoader
 * @param {string[]} positionals - non-flag arguments
 */
async function run(commandMap, configLoader, positionals) {
  const [cmd, ...args] = positionals;
  if (cmd === undefined) {
    await runInteractive(commandMap, configLoader);
    return;
  }
  const command = commandMap.get(cmd);
  if (!command) {
    throw new Error(
      `Unknown command: ${cmd}. Available: ${[...commandMap.keys()].join(', ')}.`
    );
  }
  await command.execute(args);
}

/**
 * Interactive mode: list available configs and let the user pick one.
 * @param {Map<string, object>} commandMap
 * @param {ConfigLoader} configLoader
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
  await commandMap.get('check').execute([selected]);
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

const isEntryPoint =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(error.message + '\n');
    process.exit(1);
  }
}