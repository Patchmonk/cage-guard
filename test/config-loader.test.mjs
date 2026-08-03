import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConfigLoader } from '../src/services/config-loader.service.mjs';
import { FileLock } from '../src/services/file-lock.service.mjs';

function makeConfigsDir() {
  return mkdtempSync(join(tmpdir(), 'cage-configs-'));
}

function makeProjectRoot() {
  return mkdtempSync(join(tmpdir(), 'cage-root-'));
}

test('write stamps the version and load round-trips', () => {
  const configsDir = makeConfigsDir();
  const root = makeProjectRoot();
  try {
    const loader = new ConfigLoader(configsDir, new FileLock());
    loader.write('proj', {
      name: 'Proj',
      root,
      protected: ['package.json', 'eslint.config.js'],
    });

    const raw = JSON.parse(readFileSync(join(configsDir, 'proj.json'), 'utf8'));
    assert.equal(raw.version, 1);

    const config = loader.load('proj');
    assert.equal(config.name, 'Proj');
    assert.equal(config.root, root);
    assert.deepEqual(config.protected, ['package.json', 'eslint.config.js']);
    assert.equal(config.version, 1);
  } finally {
    rmSync(configsDir, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});

test('load migrates a version-less config to v1', () => {
  const configsDir = makeConfigsDir();
  const root = makeProjectRoot();
  try {
    writeFileSync(
      join(configsDir, 'old.json'),
      JSON.stringify({ name: 'Old', root, protected: ['a.txt'] })
    );
    const loader = new ConfigLoader(configsDir, new FileLock());
    const config = loader.load('old');
    assert.equal(config.version, 1);
  } finally {
    rmSync(configsDir, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});

test('load rejects an unsupported config version', () => {
  const configsDir = makeConfigsDir();
  const root = makeProjectRoot();
  try {
    writeFileSync(
      join(configsDir, 'v2.json'),
      JSON.stringify({ version: 2, name: 'V2', root, protected: ['a.txt'] })
    );
    const loader = new ConfigLoader(configsDir, new FileLock());
    assert.throws(() => loader.load('v2'), /Unsupported config version: 2/);
  } finally {
    rmSync(configsDir, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});

test('load reports a missing config', () => {
  const configsDir = makeConfigsDir();
  try {
    const loader = new ConfigLoader(configsDir, new FileLock());
    assert.throws(
      () => loader.load('nope'),
      /Config not found: configs\/nope\.json/
    );
  } finally {
    rmSync(configsDir, { recursive: true, force: true });
  }
});

test('validate cleans empty and duplicate protected patterns', () => {
  const configsDir = makeConfigsDir();
  const root = makeProjectRoot();
  try {
    const loader = new ConfigLoader(configsDir, new FileLock());
    const cleaned = loader.validate({
      name: 'X',
      root,
      protected: ['a.txt', '', ' a.txt ', 'b.txt', 'b.txt'],
    });
    assert.deepEqual(cleaned.protected, ['a.txt', 'b.txt']);
  } finally {
    rmSync(configsDir, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});

test('listAll returns sorted config names and skips .gitkeep', () => {
  const configsDir = makeConfigsDir();
  try {
    writeFileSync(join(configsDir, '.gitkeep'), '');
    writeFileSync(join(configsDir, 'beta.json'), '{}');
    writeFileSync(join(configsDir, 'alpha.json'), '{}');
    const loader = new ConfigLoader(configsDir, new FileLock());
    assert.deepEqual(loader.listAll(), ['alpha', 'beta']);
  } finally {
    rmSync(configsDir, { recursive: true, force: true });
  }
});