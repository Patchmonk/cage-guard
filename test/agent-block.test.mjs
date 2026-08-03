import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CheckResult } from '../src/models/check-result.model.mjs';
import { FileResult, STATUS } from '../src/models/file-result.model.mjs';
import { TextOutput } from '../src/output/text.output.mjs';

// Pinned to a local-time Date so report filenames are deterministic.
const FIXED_TIME = new Date(2026, 0, 1, 0, 0, 0);
const fixedFormat = () => '2026-01-01 00:00:00';

test('agentBlock golden output for a violation', () => {
  const output = new TextOutput(join(tmpdir(), 'irrelevant'), fixedFormat);
  const files = [
    new FileResult('package.json', STATUS.MODIFIED, 'abc123def456', 'def456abc123', FIXED_TIME),
    new FileResult('tsconfig.json', STATUS.MISSING, '111222333444', null, null),
    new FileResult('eslint.config.js', STATUS.NOT_LOCKED, 'aaa111bbb222', 'aaa111bbb222', null),
  ];
  const result = new CheckResult('My Project', 'my-project', FIXED_TIME, files, '/abs/root');

  const expected = [
    '=== CAGE GUARD REPORT ===',
    'Project:   My Project',
    'Config:    configs/my-project.json',
    'Root:      /abs/root',
    'Checked:   2026-01-01 00:00:00',
    'Status:    VIOLATION',
    '',
    'MODIFIED FILES:',
    '  package.json',
    '    expected: abc123def456',
    '    actual:   def456abc123',
    '    modified: 2026-01-01 00:00:00',
    '',
    'MISSING FILES:',
    '  tsconfig.json',
    '    expected: 111222333444',
    '',
    'WARNINGS:',
    '  eslint.config.js — hash matches but file is not locked',
    '',
    'ACTION REQUIRED:',
    '  Protected files were modified or deleted.',
    '  Revert ALL modifications to your last known good state.',
    '  Do not continue building on a modified foundation.',
    "  After reverting, re-run your project's validation process.",
    '  If the modification was intentional and authorized by the',
    '  project owner, re-run: node guard.mjs capture my-project',
    '=== END REPORT ===',
  ].join('\n') + '\n';

  assert.equal(output.agentBlock(result), expected);
});

test('agentBlock golden output for a clean project', () => {
  const output = new TextOutput(join(tmpdir(), 'irrelevant'), fixedFormat);
  const files = [
    new FileResult('package.json', STATUS.INTACT, 'abc123def456', 'abc123def456', null),
    new FileResult('tsconfig.json', STATUS.NOT_CAPTURED, null, null, null),
  ];
  const result = new CheckResult('Clean Proj', 'clean-proj', FIXED_TIME, files, '/abs/root');

  const expected = [
    '=== CAGE GUARD REPORT ===',
    'Project:   Clean Proj',
    'Config:    configs/clean-proj.json',
    'Root:      /abs/root',
    'Checked:   2026-01-01 00:00:00',
    'Status:    OK',
    '',
    'WARNINGS:',
    '  tsconfig.json — listed in config but never captured',
    '',
    '=== END REPORT ===',
  ].join('\n') + '\n';

  assert.equal(output.agentBlock(result), expected);
});

test('writeReportFile writes a sanitized, timestamped log file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cage-reports-'));
  try {
    const output = new TextOutput(dir, fixedFormat);
    const files = [
      new FileResult('package.json', STATUS.INTACT, 'abc', 'abc', null),
    ];
    const result = new CheckResult('My Project', 'my-project', FIXED_TIME, files, '/abs/root');
    const filePath = output.writeReportFile(result);
    assert.equal(filePath, join(dir, 'My-Project-2026-01-01-0000.log'));
    const content = readFileSync(filePath, 'utf8');
    assert.ok(content.includes('=== CAGE GUARD REPORT ==='));
    assert.ok(content.includes('Status:    OK'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});