import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CheckCommand } from '../src/commands/check.command.mjs';
import { ConfigLoader } from '../src/services/config-loader.service.mjs';
import { FileLock } from '../src/services/file-lock.service.mjs';
import { HashStore } from '../src/services/hash-store.service.mjs';
import { STATUS } from '../src/models/file-result.model.mjs';

/** A silent output stub that records rendered results. */
class StubOutput {
  constructor() {
    this.checkResults = [];
    this.combined = null;
    this.warnings = [];
  }
  renderCheckResult(result) {
    this.checkResults.push(result);
  }
  renderAgentBlock() {}
  renderCombinedSummary(results) {
    this.combined = results;
  }
  renderWarning(message) {
    this.warnings.push(message);
  }
  renderError() {}
  writeReportFile() {
    return null;
  }
  isSingleDocument() {
    return false;
  }
}

function setup() {
  const configsDir = mkdtempSync(join(tmpdir(), 'cage-check-configs-'));
  const hashesDir = mkdtempSync(join(tmpdir(), 'cage-check-hashes-'));
  const root = mkdtempSync(join(tmpdir(), 'cage-check-root-'));
  const lock = new FileLock();
  const loader = new ConfigLoader(configsDir, lock);
  const store = new HashStore(hashesDir, lock);
  return { configsDir, hashesDir, root, lock, loader, store };
}

test('check classifies an intact file as INTACT', async () => {
  const { root, lock, loader, store } = setup();
  try {
    writeFileSync(join(root, 'a.txt'), 'hello');
    loader.write('proj', { name: 'Proj', root, protected: ['a.txt'] });
    store.save('proj', [{ relativePath: 'a.txt', sha256: store.compute(join(root, 'a.txt')), captured: true }]);
    lock.lock(join(root, 'a.txt'));
    const output = new StubOutput();
    const command = new CheckCommand(loader, store, lock, output);
    await command.execute(['proj']);
    const result = output.checkResults[0];
    assert.equal(result.files[0].status, STATUS.INTACT);
    assert.equal(result.passed, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('check classifies a modified file as MODIFIED and sets exit code', async () => {
  const { root, lock, loader, store } = setup();
  try {
    writeFileSync(join(root, 'a.txt'), 'original');
    loader.write('proj', { name: 'Proj', root, protected: ['a.txt'] });
    store.save('proj', [{ relativePath: 'a.txt', sha256: store.compute(join(root, 'a.txt')), captured: true }]);
    lock.lock(join(root, 'a.txt'));
    // Modify the file after capture (unlock first so the write succeeds).
    lock.unlock(join(root, 'a.txt'));
    writeFileSync(join(root, 'a.txt'), 'changed');
    const output = new StubOutput();
    const command = new CheckCommand(loader, store, lock, output);
    await command.execute(['proj']);
    const result = output.checkResults[0];
    assert.equal(result.files[0].status, STATUS.MODIFIED);
    assert.equal(result.passed, false);
    assert.equal(process.exitCode, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('check all-mode renders a combined summary', async () => {
  const { root, lock, loader, store } = setup();
  try {
    writeFileSync(join(root, 'a.txt'), 'hello');
    loader.write('proj', { name: 'Proj', root, protected: ['a.txt'] });
    store.save('proj', [{ relativePath: 'a.txt', sha256: store.compute(join(root, 'a.txt')), captured: true }]);
    lock.lock(join(root, 'a.txt'));
    const output = new StubOutput();
    const command = new CheckCommand(loader, store, lock, output);
    await command.execute([]);
    assert.ok(output.combined);
    assert.equal(output.combined.length, 1);
    assert.equal(output.combined[0].passed, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});