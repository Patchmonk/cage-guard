import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Scanner } from '../src/services/scanner.service.mjs';

test('scan detects known config files and assigns profiles', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cage-scan-'));
  try {
    writeFileSync(join(dir, 'package.json'), '{}');
    writeFileSync(join(dir, 'eslint.config.js'), '{}');
    const scanner = new Scanner();
    const matches = scanner.scan(dir);
    const paths = matches.map((match) => match.matchedPath);
    assert.ok(paths.includes('package.json'));
    assert.ok(paths.includes('eslint.config.js'));
    const eslint = matches.find((match) => match.matchedPath === 'eslint.config.js');
    assert.equal(eslint.profile, 'linters-formatters');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('suggestFolderPatterns suggests a parent folder with 2+ files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cage-scan2-'));
  try {
    mkdirSync(join(dir, 'scripts'));
    writeFileSync(join(dir, 'scripts', 'a.js'), 'a');
    writeFileSync(join(dir, 'scripts', 'b.js'), 'b');
    const scanner = new Scanner();
    const matches = scanner.scan(dir);
    const suggestions = scanner.suggestFolderPatterns(matches);
    assert.ok(suggestions.includes('scripts/**'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});