import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { UnprotectCommand } from '../src/commands/unprotect.command.mjs';
import { ConfigLoader } from '../src/services/config-loader.service.mjs';
import { FileLock } from '../src/services/file-lock.service.mjs';
import { HashStore } from '../src/services/hash-store.service.mjs';

/** A silent output stub that records messages. */
class StubOutput {
  constructor() {
    this.messages = [];
  }
  renderMessage(message) {
    this.messages.push(message);
  }
}

test('unprotect blocks removing the last protected pattern', async () => {
  const configsDir = mkdtempSync(join(tmpdir(), 'cage-unprotect-'));
  const root = mkdtempSync(join(tmpdir(), 'cage-unprotect-root-'));
  try {
    const loader = new ConfigLoader(configsDir, new FileLock());
    loader.write('proj', { name: 'Proj', root, protected: ['package.json'] });
    const command = new UnprotectCommand(loader, new HashStore(configsDir, new FileLock()), new FileLock(), new StubOutput());
    await assert.rejects(
      () => command.execute(['proj', 'package.json']),
      /Cannot remove the last protected pattern/
    );
    // Config is unchanged and still loadable.
    const config = loader.load('proj');
    assert.deepEqual(config.protected, ['package.json']);
  } finally {
    rmSync(configsDir, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});

test('unprotect removes a non-last pattern', () => {
  const configsDir = mkdtempSync(join(tmpdir(), 'cage-unprotect2-'));
  const root = mkdtempSync(join(tmpdir(), 'cage-unprotect2-root-'));
  try {
    const loader = new ConfigLoader(configsDir, new FileLock());
    loader.write('proj', { name: 'Proj', root, protected: ['a.txt', 'b.txt'] });
    const output = new StubOutput();
    const command = new UnprotectCommand(loader, new HashStore(configsDir, new FileLock()), new FileLock(), output);
    command.execute(['proj', 'a.txt']);
    const config = loader.load('proj');
    assert.deepEqual(config.protected, ['b.txt']);
    assert.ok(output.messages.some((m) => m.includes('Removed pattern: a.txt')));
  } finally {
    rmSync(configsDir, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});