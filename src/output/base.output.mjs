/**
 * Abstract output strategy. All console and file output flows through an
 * Output implementation. Commands depend on this interface (Dependency
 * Inversion): they never print directly and never know the output format.
 *
 * Two concrete strategies exist: TextOutput (human-readable) and
 * JsonOutput (machine-readable). Adding a new format means adding a new
 * Output subclass — no command changes (Open/Closed).
 */
export class Output {
  /**
   * Print a warning line. Text goes to stdout; JSON keeps stdout pure.
   * @param {string} message - warning text
   */
  renderWarning(message) {
    throw new Error('not implemented');
  }

  /**
   * Print an error line to stderr.
   * @param {string} message - error text
   */
  renderError(message) {
    throw new Error('not implemented');
  }

  /**
   * Print a plain informational message.
   * @param {string} message - message text
   */
  renderMessage(message) {
    throw new Error('not implemented');
  }

  /**
   * Render the result of a capture operation.
   * @param {ProjectConfig} config - loaded project config
   * @param {Array<{ relativePath: string, sha256: string, captured: boolean }>} entries
   * @param {number} warningCount - number of warnings emitted during capture
   */
  renderCaptureResult(config, entries, warningCount) {
    throw new Error('not implemented');
  }

  /**
   * Render a capture that matched no files. Text prints a message;
   * JSON emits a capture document with total 0 so stdout stays one doc.
   * @param {ProjectConfig} config - loaded project config
   * @param {number} warningCount - number of warnings emitted during capture
   */
  renderEmptyCapture(config, warningCount) {
    throw new Error('not implemented');
  }

  /**
   * Render the result of a single-project check.
   * @param {CheckResult} checkResult - computed check result
   */
  renderCheckResult(checkResult) {
    throw new Error('not implemented');
  }

  /**
   * Render the agent-paste report block for a check with violations.
   * @param {CheckResult} checkResult - computed check result
   */
  renderAgentBlock(checkResult) {
    throw new Error('not implemented');
  }

  /**
   * Render the result of a status query.
   * @param {StatusResult} statusResult - computed status result
   */
  renderStatusResult(statusResult) {
    throw new Error('not implemented');
  }

  /**
   * Render the combined multi-project summary.
   * @param {Array<object>} results - CheckResult or CheckError objects
   */
  renderCombinedSummary(results) {
    throw new Error('not implemented');
  }

  /**
   * Persist the report file for a check. Text writes the agent block;
   * Json is a no-op (stdout JSON is the machine-readable artifact).
   * @param {CheckResult} checkResult - computed check result
   * @returns {string|null} written file path, or null when not written
   */
  writeReportFile(checkResult) {
    throw new Error('not implemented');
  }

  /**
   * Whether stdout carries exactly one JSON document per invocation.
   * Text is false (it streams human-readable sections); Json is true.
   * Commands use this to decide whether per-project sections are safe
   * to render in all-projects mode.
   * @returns {boolean} true when the output is a single-document format
   */
  isSingleDocument() {
    return false;
  }
}