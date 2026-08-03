import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  wildcardToRegex,
  sanitizeFilename,
  isAbsolutePath,
  expandPatterns,
  walkDir,
} from '../src/utils/paths.util.mjs';

test('wildcardToRegex anchors and matches path segments', () => {
  assert.match('package.json', wildcardToRegex('package.json'));
  assert.match('tsconfig.json', wildcardToRegex('tsconfig*.json'));
  assert.doesNotMatch('tsconfig.base.json', wildcardToRegex('tsconfig.json'));
  assert.match('src/app.ts', wildcardToRegex('src/*.ts'));
  assert.doesNotMatch('src/deep/app.ts', wildcardToRegex('src/*.ts'));
  assert.match('src/deep/app.ts', wildcardToRegex('src/**'));
});

test('sanitizeFilename replaces dangerous characters and collapses hyphens', () => {
  assert.equal(sanitizeFilename('my project:name'), 'my-project-name');
  assert.equal(sanitizeFilename('a--b'), 'a-b');
  assert.equal(sanitizeFilename('-trim-'), 'trim');
});

test('isAbsolutePath detects POSIX and Windows absolute paths', () => {
  assert.equal(isAbsolutePath('/home/user'), true);
  assert.equal(isAbsolutePath('C:/Users/me'), true);
  assert.equal(isAbsolutePath('C:\\Users\\me'), true);
  assert.equal(isAbsolutePath('relative/path'), false);
});

test('expandPatterns expands exact, wildcard, and recursive patterns', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cage-paths-'));
  try {
    writeFileSync(join(dir, 'package.json'), '{}');
    writeFileSync(join(dir, 'tsconfig.json'), '{}');
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'app.ts'), 'x');
    mkdirSync(join(dir, 'src', 'deep'));
    writeFileSync(join(dir, 'src', 'deep', 'lib.ts'), 'y');

    const exact = expandPatterns(dir, ['package.json']);
    assert.deepEqual(exact.paths, [join(dir, 'package.json')]);

    const wildcard = expandPatterns(dir, ['src/*.ts']);
    assert.deepEqual(wildcard.paths, [join(dir, 'src', 'app.ts')]);

    const recursive = expandPatterns(dir, ['src/**']);
    assert.deepEqual(
      recursive.paths.sort(),
      [join(dir, 'src', 'app.ts'), join(dir, 'src', 'deep', 'lib.ts')].sort()
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('walkDir walks recursively and skips named directories', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cage-walk-'));
  try {
    writeFileSync(join(dir, 'a.txt'), 'a');
    mkdirSync(join(dir, 'node_modules'));
    writeFileSync(join(dir, 'node_modules', 'b.txt'), 'b');
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'sub', 'c.txt'), 'c');

    const files = walkDir(dir, true, ['node_modules']);
    assert.deepEqual(
      files.sort(),
      [join(dir, 'a.txt'), join(dir, 'sub', 'c.txt')].sort()
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});