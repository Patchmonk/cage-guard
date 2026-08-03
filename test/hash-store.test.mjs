import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FileLock } from '../src/services/file-lock.service.mjs';
import { HashStore } from '../src/services/hash-store.service.mjs';

function makeHashesDir() {
  return mkdtempSync(join(tmpdir(), 'cage-hashes-'));
}

test('compute returns a sha256 hex digest', () => {
  const dir = makeHashesDir();
  const lock = new FileLock();
  try {
    const file = join(dir, 'a.txt');
    writeFileSync(file, 'hello');
    const store = new HashStore(dir, lock);
    const digest = store.compute(file);
    assert.match(digest, /^[0-9a-f]{64}$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('save persists version and files, load round-trips', () => {
  const dir = makeHashesDir();
  const lock = new FileLock();
  try {
    const store = new HashStore(dir, lock);
    store.save('proj', [
      { relativePath: 'a.txt', sha256: 'abc123', captured: false },
      { relativePath: 'b.txt', sha256: 'def456', captured: true },
    ]);
    const loaded = store.load('proj');
    assert.equal(loaded.version, 1);
    assert.equal(loaded.project, 'proj');
    assert.equal(loaded.files['a.txt'].sha256, 'abc123');
    // captured is persisted as an ISO timestamp string, not a boolean.
    assert.match(loaded.files['b.txt'].captured, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    lock.unlock(join(dir, 'proj.hashes.json'));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('save locks the store file afterwards', () => {
  const dir = makeHashesDir();
  const lock = new FileLock();
  try {
    const store = new HashStore(dir, lock);
    store.save('proj', [{ relativePath: 'a.txt', sha256: 'x', captured: true }]);
    assert.equal(lock.isLocked(join(dir, 'proj.hashes.json')), true);
  } finally {
    lock.unlock(join(dir, 'proj.hashes.json'));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('load returns null when no store exists', () => {
  const dir = makeHashesDir();
  try {
    const store = new HashStore(dir, new FileLock());
    assert.equal(store.load('missing'), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('load rejects an unsupported hash store version', () => {
  const dir = makeHashesDir();
  try {
    writeFileSync(
      join(dir, 'v2.hashes.json'),
      JSON.stringify({ version: 2, project: 'v2', files: {} })
    );
    const store = new HashStore(dir, new FileLock());
    assert.throws(() => store.load('v2'), /Unsupported hash store version: 2/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});