import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MenuCommand } from '../src/commands/menu.command.mjs';
import { ConfigLoader } from '../src/services/config-loader.service.mjs';
import { FileLock } from '../src/services/file-lock.service.mjs';
import { HashStore } from '../src/services/hash-store.service.mjs';

/** A silent output stub that records what the menu rendered. */
class StubOutput {
  constructor() {
    this.messages = [];
    this.pickers = [];
    this.menus = [];
  }
  renderMessage(message) {
    this.messages.push(message);
  }
  renderProjectPicker(entries) {
    this.pickers.push(entries);
  }
  renderActionMenu(entry) {
    this.menus.push(entry);
  }
}

/**
 * A stub command set that records every delegated execute() call.
 * @returns {{ calls: Array<[string, string[]]>, capture: object, unlock: object, check: object, status: object }}
 */
function makeCommands() {
  const calls = [];
  const command = (label) => ({
    execute: async (args) => {
      calls.push([label, args]);
    },
  });
  return {
    calls,
    capture: command('capture'),
    unlock: command('unlock'),
    check: command('check'),
    status: command('status'),
  };
}

/**
 * Queue-based stdin stub: returns the next canned answer per prompt.
 * @param {string[]} answers - answers to serve, in order
 * @returns {() => Promise<string>} async answer getter
 */
function makeAnswers(answers) {
  const queue = [...answers];
  return async () => queue.shift();
}

/**
 * Fresh hermetic temp directories plus real service instances.
 * @returns {{ configsDir: string, hashesDir: string, root: string, lock: FileLock, loader: ConfigLoader, store: HashStore }}
 */
function setup() {
  const configsDir = mkdtempSync(join(tmpdir(), 'cage-menu-configs-'));
  const hashesDir = mkdtempSync(join(tmpdir(), 'cage-menu-hashes-'));
  const root = mkdtempSync(join(tmpdir(), 'cage-menu-root-'));
  const lock = new FileLock();
  const loader = new ConfigLoader(configsDir, lock);
  const store = new HashStore(hashesDir, lock);
  return { configsDir, hashesDir, root, lock, loader, store };
}

/** Clean up all temp directories created by setup(). */
function cleanup(fixtures) {
  rmSync(fixtures.root, { recursive: true, force: true });
  rmSync(fixtures.configsDir, { recursive: true, force: true });
  rmSync(fixtures.hashesDir, { recursive: true, force: true });
}

test('menu with no projects shows onboarding and exits cleanly', async () => {
  const fixtures = setup();
  try {
    const output = new StubOutput();
    const commands = makeCommands();
    const command = new MenuCommand(
      fixtures.loader,
      fixtures.store,
      fixtures.lock,
      output,
      commands
    );
    await command.execute([]);
    assert.equal(output.messages.length, 1);
    assert.match(output.messages[0], /init/);
    assert.equal(output.pickers.length, 0);
    assert.equal(output.menus.length, 0);
    assert.equal(commands.calls.length, 0);
    assert.equal(process.exitCode, 0);
  } finally {
    cleanup(fixtures);
  }
});

test('single project goes straight to the action menu, skipping the picker', async () => {
  const fixtures = setup();
  try {
    writeFileSync(join(fixtures.root, 'a.txt'), 'hello');
    fixtures.loader.write('alpha', {
      name: 'Alpha',
      root: fixtures.root,
      protected: ['a.txt'],
    });
    const output = new StubOutput();
    const commands = makeCommands();
    const command = new MenuCommand(
      fixtures.loader,
      fixtures.store,
      fixtures.lock,
      output,
      commands
    );
    command._ask = makeAnswers(['q']);
    await command.execute([]);
    assert.equal(output.pickers.length, 0);
    assert.equal(output.menus.length, 1);
    assert.equal(output.menus[0].name, 'alpha');
    assert.equal(output.menus[0].hasStore, false);
    assert.equal(output.menus[0].fileCount, 0);
    assert.equal(commands.calls.length, 0);
  } finally {
    cleanup(fixtures);
  }
});

test('multiple projects render the picker and accept a numbered selection', async () => {
  const fixtures = setup();
  try {
    writeFileSync(join(fixtures.root, 'a.txt'), 'hello');
    writeFileSync(join(fixtures.root, 'b.txt'), 'world');
    fixtures.loader.write('alpha', {
      name: 'Alpha',
      root: fixtures.root,
      protected: ['a.txt'],
    });
    fixtures.loader.write('beta', {
      name: 'Beta',
      root: fixtures.root,
      protected: ['b.txt'],
    });
    const output = new StubOutput();
    const commands = makeCommands();
    const command = new MenuCommand(
      fixtures.loader,
      fixtures.store,
      fixtures.lock,
      output,
      commands
    );
    // Select alpha by number, then quit the action menu.
    command._ask = makeAnswers(['1', 'q']);
    await command.execute([]);
    assert.equal(output.pickers.length, 1);
    assert.equal(output.pickers[0].length, 2);
    assert.equal(output.pickers[0][0].name, 'alpha');
    assert.equal(output.pickers[0][1].name, 'beta');
    assert.equal(output.menus.length, 1);
    assert.equal(output.menus[0].name, 'alpha');
    assert.equal(commands.calls.length, 0);
  } finally {
    cleanup(fixtures);
  }
});

test('picker loops on an invalid selection before accepting a valid one', async () => {
  const fixtures = setup();
  try {
    writeFileSync(join(fixtures.root, 'a.txt'), 'hello');
    fixtures.loader.write('alpha', {
      name: 'Alpha',
      root: fixtures.root,
      protected: ['a.txt'],
    });
    fixtures.loader.write('beta', {
      name: 'Beta',
      root: fixtures.root,
      protected: ['a.txt'],
    });
    const output = new StubOutput();
    const commands = makeCommands();
    const command = new MenuCommand(
      fixtures.loader,
      fixtures.store,
      fixtures.lock,
      output,
      commands
    );
    // Invalid number, then an exact name, then quit the action menu.
    command._ask = makeAnswers(['9', 'beta', 'q']);
    await command.execute([]);
    assert.equal(output.pickers.length, 1);
    assert.equal(output.menus.length, 1);
    assert.equal(output.menus[0].name, 'beta');
    assert.ok(output.messages.some((m) => /Invalid selection/.test(m)));
  } finally {
    cleanup(fixtures);
  }
});

test('_resolveSelection maps numbers, names, and invalid answers', async () => {
  const fixtures = setup();
  try {
    const output = new StubOutput();
    const command = new MenuCommand(
      fixtures.loader,
      fixtures.store,
      fixtures.lock,
      output,
      makeCommands()
    );
    const names = ['alpha', 'beta'];
    assert.equal(command._resolveSelection(names, '1'), 'alpha');
    assert.equal(command._resolveSelection(names, '2'), 'beta');
    assert.equal(command._resolveSelection(names, 'beta'), 'beta');
    assert.equal(command._resolveSelection(names, '0'), null);
    assert.equal(command._resolveSelection(names, '3'), null);
    assert.equal(command._resolveSelection(names, 'nope'), null);
    assert.equal(command._resolveSelection(names, ''), null);
    assert.equal(command._resolveSelection(names, '  '), null);
  } finally {
    cleanup(fixtures);
  }
});

test('confirming no skips capture delegation', async () => {
  const fixtures = setup();
  try {
    writeFileSync(join(fixtures.root, 'a.txt'), 'hello');
    fixtures.loader.write('alpha', {
      name: 'Alpha',
      root: fixtures.root,
      protected: ['a.txt'],
    });
    const output = new StubOutput();
    const commands = makeCommands();
    const command = new MenuCommand(
      fixtures.loader,
      fixtures.store,
      fixtures.lock,
      output,
      commands
    );
    // Choose Lock(1), decline the confirmation, then quit.
    command._ask = makeAnswers(['1', 'n', 'q']);
    await command.execute([]);
    assert.deepEqual(commands.calls, []);
  } finally {
    cleanup(fixtures);
  }
});

test('confirming yes delegates capture and unlock with the project name', async () => {
  const fixtures = setup();
  try {
    writeFileSync(join(fixtures.root, 'a.txt'), 'hello');
    fixtures.loader.write('alpha', {
      name: 'Alpha',
      root: fixtures.root,
      protected: ['a.txt'],
    });
    const output = new StubOutput();
    const commands = makeCommands();
    const command = new MenuCommand(
      fixtures.loader,
      fixtures.store,
      fixtures.lock,
      output,
      commands
    );
    // Lock(1) yes, Unlock(2) yes, then quit.
    command._ask = makeAnswers(['1', 'y', '2', 'y', 'q']);
    await command.execute([]);
    assert.deepEqual(commands.calls, [
      ['capture', ['alpha']],
      ['unlock', ['alpha']],
    ]);
  } finally {
    cleanup(fixtures);
  }
});

test('a corrupted config yields an error entry without killing the run', async () => {
  const fixtures = setup();
  try {
    writeFileSync(join(fixtures.root, 'a.txt'), 'hello');
    fixtures.loader.write('alpha', {
      name: 'Alpha',
      root: fixtures.root,
      protected: ['a.txt'],
    });
    writeFileSync(join(fixtures.configsDir, 'broken.json'), '{ not json');
    const output = new StubOutput();
    const commands = makeCommands();
    const command = new MenuCommand(
      fixtures.loader,
      fixtures.store,
      fixtures.lock,
      output,
      commands
    );
    // The broken project is in the list; select the valid one and quit.
    command._ask = makeAnswers(['1', 'q']);
    await command.execute([]);
    assert.equal(output.pickers.length, 1);
    assert.equal(output.pickers[0].length, 2);
    assert.equal(output.pickers[0][0].name, 'alpha');
    assert.equal(output.pickers[0][1].name, 'broken');
    assert.match(output.pickers[0][1].error, /Invalid JSON/);
    assert.equal(output.menus[0].name, 'alpha');
    // Direct helper check too: error entry, no throw.
    const entry = command._buildEntry('broken');
    assert.equal(entry.name, 'broken');
    assert.match(entry.error, /Invalid JSON/);
  } finally {
    cleanup(fixtures);
  }
});