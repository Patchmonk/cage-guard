import { basename } from 'node:path';

import { Output } from './base.output.mjs';

/**
 * Machine-readable output strategy. stdout carries exactly one JSON
 * document per invocation; warnings and messages divert to stderr so
 * the JSON stays parseable. The agent block and report file are
 * human/agent artifacts, so JsonOutput no-ops both (Null Object).
 *
 * Every document carries a versioned `schema` field and an `exitCode`
 * field that mirrors the process exit code — consumers never parse
 * stdout text to determine status.
 */
export class JsonOutput extends Output {
  /**
   * Warnings go to stderr so stdout remains pure JSON.
   * @param {string} message - warning text
   */
  renderWarning(message) {
    process.stderr.write(`! ${message}\n`);
  }

  /**
   * Errors go to stderr as plain text.
   * @param {string} message - error text
   */
  renderError(message) {
    process.stderr.write(`${message}\n`);
  }

  /**
   * Messages go to stderr so stdout remains pure JSON.
   * @param {string} message - message text
   */
  renderMessage(message) {
    process.stderr.write(`${message}\n`);
  }

  /**
   * Emit the capture document.
   * @param {ProjectConfig} config - loaded project config
   * @param {Array<{ relativePath: string, sha256: string, captured: boolean }>} entries
   * @param {number} warningCount - number of warnings emitted during capture
   */
  renderCaptureResult(config, entries, warningCount) {
    const document = {
      schema: 'cage-guard/capture@1',
      exitCode: 0,
      project: this._projectOf(config.name, config),
      capturedAt: new Date().toISOString(),
      summary: {
        total: entries.length,
        captured: entries.length,
        warnings: warningCount,
      },
      files: entries.map((entry) => ({
        relativePath: entry.relativePath,
        sha256: entry.sha256,
        captured: entry.captured,
      })),
    };
    this._emit(document);
  }

  /**
   * Emit a capture document for a run that matched no files, so stdout
   * still carries exactly one document.
   * @param {ProjectConfig} config - loaded project config
   * @param {number} warningCount - number of warnings emitted during capture
   */
  renderEmptyCapture(config, warningCount) {
    const document = {
      schema: 'cage-guard/capture@1',
      exitCode: 0,
      project: this._projectOf(config.name, config),
      capturedAt: new Date().toISOString(),
      summary: {
        total: 0,
        captured: 0,
        warnings: warningCount,
      },
      files: [],
    };
    this._emit(document);
  }

  /**
   * Emit the single-project check document.
   * @param {CheckResult} checkResult - computed check result
   */
  renderCheckResult(checkResult) {
    const document = {
      schema: 'cage-guard/check@1',
      exitCode: checkResult.violations > 0 ? 1 : 0,
      project: {
        name: checkResult.projectName,
        configName: checkResult.configName,
        root: checkResult.root,
      },
      checkedAt: checkResult.checkedAt.toISOString(),
      summary: {
        total: checkResult.total,
        intact: checkResult.intact,
        violations: checkResult.violations,
        warnings: checkResult.warnings,
        passed: checkResult.passed,
      },
      files: checkResult.files.map((file) => ({
        relativePath: file.relativePath,
        status: file.status,
        expectedHash: file.expectedHash,
        actualHash: file.actualHash,
        modifiedAt: file.modifiedAt ? file.modifiedAt.toISOString() : null,
      })),
    };
    this._emit(document);
  }

  /**
   * The agent-paste block is a human/agent artifact; no-op in JSON mode.
   * @param {CheckResult} _checkResult - unused
   */
  renderAgentBlock(_checkResult) {
    // Intentionally empty (Null Object).
  }

  /**
   * Emit the status document.
   * @param {StatusResult} statusResult - computed status result
   */
  renderStatusResult(statusResult) {
    const document = {
      schema: 'cage-guard/status@1',
      exitCode: 0,
      project: {
        name: statusResult.projectName,
        configName: statusResult.configName,
        root: statusResult.root,
      },
      configLocked: statusResult.configLocked,
      lastCapturedAt: statusResult.lastCapturedAt,
      protectedPatterns: statusResult.protectedPatterns,
      fileCount: statusResult.fileCount,
    };
    this._emit(document);
  }

  /**
   * Emit the combined multi-project check document. Error projects are
   * distinguished by the `error` data field, never by instance type.
   * @param {Array<object>} results - CheckResult or CheckError objects
   */
  renderCombinedSummary(results) {
    const projects = results.map((result) => {
      if (result.error) {
        return {
          project: result.projectName,
          configName: result.configName,
          passed: false,
          error: result.error,
        };
      }
      return {
        project: result.projectName,
        configName: result.configName,
        passed: result.passed,
        total: result.total,
        intact: result.intact,
        violations: result.violations,
      };
    });
    const clean = results.filter((result) => !result.error && result.passed).length;
    const violations = results.reduce(
      (total, result) => total + (result.error ? 0 : result.violations),
      0
    );
    const errors = results.filter((result) => result.error).length;
    const passed = clean === results.length;
    const document = {
      schema: 'cage-guard/check-all@1',
      exitCode: passed ? 0 : 1,
      checkedAt: new Date().toISOString(),
      summary: {
        projects: results.length,
        clean,
        violations,
        errors,
        passed,
      },
      projects,
    };
    this._emit(document);
  }

  /**
   * Report files are human artifacts; no-op in JSON mode.
   * @param {CheckResult} _checkResult - unused
   * @returns {null} nothing written
   */
  writeReportFile(_checkResult) {
    return null;
  }

  /**
   * JSON stdout carries exactly one document per invocation, so
   * all-projects mode renders only the combined document.
   * @returns {boolean} true
   */
  isSingleDocument() {
    return true;
  }

  /**
   * Project identity from a config object (configPath present) or a
   * CheckResult-shaped object (configName + root present).
   * @param {string} name - project display name
   * @param {object} source - config or check-shaped object
   * @returns {{ name: string, configName: string, root: string }}
   */
  _projectOf(name, source) {
    const configName = source.configPath
      ? basename(source.configPath).replace(/\.json$/, '')
      : source.configName;
    return {
      name,
      configName,
      root: source.root,
    };
  }

  /**
   * Serialize one document to stdout followed by a newline.
   * @param {object} document - JSON-serializable document
   */
  _emit(document) {
    process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
  }
}