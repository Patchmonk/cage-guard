import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FileLock } from '../src/services/file-lock.service.mjs';

test('lock, isLocked, unlock round-trip', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cage-lock-'));
  try {
    const file = join(dir, 'a.txt');
    writeFileSync(file, 'x');
    const lock = new FileLock();
    assert.equal(lock.isLocked(file), false);
    assert.equal(lock.lock(file), true);
    assert.equal(lock.isLocked(file), true);
    assert.equal(lock.unlock(file), true);
    assert.equal(lock.isLocked(file), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('isLocked returns false for a missing file', () => {
  const lock = new FileLock();
  assert.equal(lock.isLocked(join(tmpdir(), 'nope-missing.txt')), false);
});