import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CheckError } from '../src/models/check-error.model.mjs';
import { CheckResult } from '../src/models/check-result.model.mjs';
import { FileResult, STATUS } from '../src/models/file-result.model.mjs';
import { StatusResult } from '../src/models/status-result.model.mjs';
import { JsonOutput } from '../src/output/json.output.mjs';

const FIXED_TIME = new Date(2026, 0, 1, 0, 0, 0);

/** Capture stdout writes during fn and return the concatenated text. */
function captureStdout(fn) {
  const chunks = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk) => {
    chunks.push(String(chunk));
    return true;
  };
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  return chunks.join('');
}

/** A minimal config-shaped object for capture/status rendering. */
function configShape(name, root) {
  return {
    name,
    root,
    configPath: `C:\\tool\\configs\\${name}.json`,
  };
}

test('renderCaptureResult emits a capture document with warning count', () => {
  const output = new JsonOutput();
  const json = captureStdout(() =>
    output.renderCaptureResult(configShape('proj', '/root'), [
      { relativePath: 'a.txt', sha256: 'abc', captured: true },
    ], 2)
  );
  const doc = JSON.parse(json);
  assert.equal(doc.schema, 'cage-guard/capture@1');
  assert.equal(doc.summary.total, 1);
  assert.equal(doc.summary.captured, 1);
  assert.equal(doc.summary.warnings, 2);
  assert.equal(doc.files[0].relativePath, 'a.txt');
});

test('renderEmptyCapture emits a total-0 capture document', () => {
  const output = new JsonOutput();
  const json = captureStdout(() => output.renderEmptyCapture(configShape('proj', '/root'), 1));
  const doc = JSON.parse(json);
  assert.equal(doc.schema, 'cage-guard/capture@1');
  assert.equal(doc.summary.total, 0);
  assert.equal(doc.summary.captured, 0);
  assert.equal(doc.summary.warnings, 1);
  assert.deepEqual(doc.files, []);
});

test('renderCheckResult emits a check document with exitCode', () => {
  const output = new JsonOutput();
  const files = [
    new FileResult('a.txt', STATUS.INTACT, 'abc', 'abc', null),
    new FileResult('b.txt', STATUS.MODIFIED, 'def', 'xyz', FIXED_TIME),
  ];
  const result = new CheckResult('Proj', 'proj', FIXED_TIME, files, '/root');
  const json = captureStdout(() => output.renderCheckResult(result));
  const doc = JSON.parse(json);
  assert.equal(doc.schema, 'cage-guard/check@1');
  assert.equal(doc.exitCode, 1);
  assert.equal(doc.summary.total, 2);
  assert.equal(doc.summary.violations, 1);
  assert.equal(doc.summary.passed, false);
  assert.equal(doc.files[1].status, 'MODIFIED');
});

test('renderStatusResult emits a status document', () => {
  const output = new JsonOutput();
  const status = new StatusResult('Proj', 'proj', '/root', true, '2026-01-01T00:00:00.000Z', ['a.txt'], 3);
  const json = captureStdout(() => output.renderStatusResult(status));
  const doc = JSON.parse(json);
  assert.equal(doc.schema, 'cage-guard/status@1');
  assert.equal(doc.configLocked, true);
  assert.deepEqual(doc.protectedPatterns, ['a.txt']);
  assert.equal(doc.fileCount, 3);
});

test('renderCombinedSummary emits one document with error projects', () => {
  const output = new JsonOutput();
  const clean = new CheckResult('Clean', 'clean', FIXED_TIME, [], '/root');
  const error = new CheckError('Broken', 'broken', 'boom');
  const json = captureStdout(() => output.renderCombinedSummary([clean, error]));
  const doc = JSON.parse(json);
  assert.equal(doc.schema, 'cage-guard/check-all@1');
  assert.equal(doc.summary.projects, 2);
  assert.equal(doc.summary.clean, 1);
  assert.equal(doc.summary.errors, 1);
  assert.equal(doc.summary.passed, false);
  assert.equal(doc.projects[1].error, 'boom');
});

test('isSingleDocument is true for JsonOutput', () => {
  assert.equal(new JsonOutput().isSingleDocument(), true);
});