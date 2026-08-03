import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseArgv } from '../guard.mjs';

test('parseArgv separates flags and positionals', () => {
  const { flags, positionals } = parseArgv(['check', 'proj', '--json']);
  assert.deepEqual(flags, ['json']);
  assert.deepEqual(positionals, ['check', 'proj']);
});

test('parseArgv handles flags in any position', () => {
  const { flags, positionals } = parseArgv(['--json', 'status', '--verbose', 'proj']);
  assert.deepEqual(flags, ['json', 'verbose']);
  assert.deepEqual(positionals, ['status', 'proj']);
});

test('parseArgv returns empty arrays for no args', () => {
  const { flags, positionals } = parseArgv([]);
  assert.deepEqual(flags, []);
  assert.deepEqual(positionals, []);
});