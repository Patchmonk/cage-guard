import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ProtectToolCommand } from '../src/commands/protect-tool.command.mjs';
import { FileLock } from '../src/services/file-lock.service.mjs';

/** A silent output stub that records tool-protect renders and messages. */
class StubOutput {
  constructor() {
    this.results = [];
    this.messages = [];
  }
  renderToolProtectResult(action, total, failedPaths) {
    this.results.push({ action, total, failedPaths });
  }
  renderMessage(message) {
    this.messages.push(message);
  }
}

/**
 * A FileLock stub whose lock/unlock always return a fixed result.
 * @param {{ lock: boolean, unlock: boolean }} results - fixed return values
 * @returns {{ lock: () => boolean, unlock: () => boolean, isLocked: () => boolean }}
 */
function makeStubLock({ lock = true, unlock = true } = {}) {
  return {
    lock: () => lock,
    unlock: () => unlock,
    isLocked: () => false,
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
 * Fresh hermetic tool-root fixture: guard.mjs plus one nested file under
 * src/ and one file under configs/.
 * @returns {{ root: string, guard: string, nested: string, config: string }}
 */
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'cage-protect-'));
  mkdirSync(join(root, 'src', 'a', 'b'), { recursive: true });
  mkdirSync(join(root, 'configs'), { recursive: true });
  writeFileSync(join(root, 'guard.mjs'), 'export const VERSION = 1;\n');
  writeFileSync(join(root, 'src', 'a', 'b', 'c.mjs'), 'export const c = 1;\n');
  writeFileSync(join(root, 'configs', 'x.json'), '{"name":"x"}\n');
  return {
    root,
    guard: join(root, 'guard.mjs'),
    nested: join(root, 'src', 'a', 'b', 'c.mjs'),
    config: join(root, 'configs', 'x.json'),
  };
}

/**
 * Fresh empty tool-root fixture with no guard.mjs, src/, or configs/.
 * @returns {{ root: string }}
 */
function setupEmpty() {
  return { root: mkdtempSync(join(tmpdir(), 'cage-protect-empty-')) };
}

/** Clean up a temp tool-root directory (force handles locked files). */
function cleanup(fixtures) {
  rmSync(fixtures.root, { recursive: true, force: true });
}

/**
 * Build a command over the given fixtures with real or stub dependencies.
 * @param {string} root - tool root passed to the command
 * @param {object} lock - FileLock or stub
 * @param {StubOutput} output - output stub
 * @returns {ProtectToolCommand}
 */
function makeCommand(root, lock, output) {
  const configLoader = { load: () => null, listAll: () => [] };
  const hashStore = { load: () => null };
  return new ProtectToolCommand(configLoader, hashStore, lock, output, root);
}

test('_collectToolFiles returns guard.mjs plus every file under src/ and configs/', () => {
  const fixtures = setup();
  try {
    const command = makeCommand(fixtures.root, makeStubLock(), new StubOutput());
    const collected = command._collectToolFiles(fixtures.root);
    assert.deepEqual(collected.sort(), [fixtures.guard, fixtures.nested, fixtures.config].sort());
  } finally {
    cleanup(fixtures);
  }
});

test('lock branch locks every file and reports a matching total', async () => {
  const fixtures = setup();
  try {
    const lock = new FileLock();
    const output = new StubOutput();
    const command = makeCommand(fixtures.root, lock, output);
    await command.execute(['lock']);
    assert.equal(output.results.length, 1);
    assert.equal(output.results[0].action, 'LOCK');
    assert.equal(output.results[0].total, 3);
    assert.deepEqual(output.results[0].failedPaths, []);
    for (const filePath of [fixtures.guard, fixtures.nested, fixtures.config]) {
      assert.equal(lock.isLocked(filePath), true);
    }
    assert.equal(process.exitCode, 0);
  } finally {
    cleanup(fixtures);
  }
});

test('lock branch captures failed paths when lock returns false', async () => {
  const fixtures = setup();
  try {
    const lock = makeStubLock({ lock: false });
    const output = new StubOutput();
    const command = makeCommand(fixtures.root, lock, output);
    await command.execute(['lock']);
    assert.equal(output.results.length, 1);
    assert.equal(output.results[0].action, 'LOCK');
    assert.equal(output.results[0].total, 0);
    assert.deepEqual(
      output.results[0].failedPaths.sort(),
      [fixtures.guard, fixtures.nested, fixtures.config].sort()
    );
    assert.equal(process.exitCode, 0);
  } finally {
    cleanup(fixtures);
  }
});

test('unlock branch unlocks every file and reports a matching total', async () => {
  const fixtures = setup();
  try {
    const lock = new FileLock();
    for (const filePath of [fixtures.guard, fixtures.nested, fixtures.config]) {
      lock.lock(filePath);
    }
    const output = new StubOutput();
    const command = makeCommand(fixtures.root, lock, output);
    await command.execute(['unlock']);
    assert.equal(output.results.length, 1);
    assert.equal(output.results[0].action, 'UNLOCK');
    assert.equal(output.results[0].total, 3);
    assert.deepEqual(output.results[0].failedPaths, []);
    for (const filePath of [fixtures.guard, fixtures.nested, fixtures.config]) {
      assert.equal(lock.isLocked(filePath), false);
    }
    assert.equal(process.exitCode, 0);
  } finally {
    cleanup(fixtures);
  }
});

test('unlock branch captures failed paths when unlock returns false', async () => {
  const fixtures = setup();
  try {
    const lock = makeStubLock({ unlock: false });
    const output = new StubOutput();
    const command = makeCommand(fixtures.root, lock, output);
    await command.execute(['unlock']);
    assert.equal(output.results.length, 1);
    assert.equal(output.results[0].action, 'UNLOCK');
    assert.equal(output.results[0].total, 0);
    assert.deepEqual(
      output.results[0].failedPaths.sort(),
      [fixtures.guard, fixtures.nested, fixtures.config].sort()
    );
    assert.equal(process.exitCode, 0);
  } finally {
    cleanup(fixtures);
  }
});

test('interactive prompt accepts lock and unlock without crashing', async () => {
  const fixtures = setup();
  try {
    const lock = new FileLock();
    const output = new StubOutput();
    const command = makeCommand(fixtures.root, lock, output);
    command._ask = makeAnswers(['l']);
    await command.execute([]);
    assert.equal(output.results.length, 1);
    assert.equal(output.results[0].action, 'LOCK');
    command._ask = makeAnswers(['u']);
    await command.execute([]);
    assert.equal(output.results.length, 2);
    assert.equal(output.results[1].action, 'UNLOCK');
    assert.equal(process.exitCode, 0);
  } finally {
    cleanup(fixtures);
  }
});

test('interactive prompt re-prompts on invalid input and quits cleanly', async () => {
  const fixtures = setup();
  try {
    const output = new StubOutput();
    const command = makeCommand(fixtures.root, makeStubLock(), output);
    command._ask = makeAnswers(['x', 'q']);
    await command.execute([]);
    assert.equal(output.results.length, 0);
    assert.equal(output.messages.filter((m) => /Invalid choice/.test(m)).length, 1);
    assert.equal(process.exitCode, 0);
  } finally {
    cleanup(fixtures);
  }
});

test('a bad positional arg throws the usage error', async () => {
  const fixtures = setup();
  try {
    const command = makeCommand(fixtures.root, makeStubLock(), new StubOutput());
    await assert.rejects(
      () => command.execute(['banana']),
      /Usage: node guard\.mjs protect-tool \[lock\|unlock\]/
    );
    await assert.rejects(
      () => command.execute(['lock', 'unlock']),
      /Usage: node guard\.mjs protect-tool \[lock\|unlock\]/
    );
  } finally {
    cleanup(fixtures);
  }
});

test('missing guard.mjs and empty src/ render a zero total without crashing', async () => {
  const fixtures = setupEmpty();
  try {
    const output = new StubOutput();
    const command = makeCommand(fixtures.root, new FileLock(), output);
    await command.execute(['lock']);
    assert.equal(output.results.length, 1);
    assert.equal(output.results[0].action, 'LOCK');
    assert.equal(output.results[0].total, 0);
    assert.deepEqual(output.results[0].failedPaths, []);
    assert.equal(process.exitCode, 0);
  } finally {
    cleanup(fixtures);
  }
});
