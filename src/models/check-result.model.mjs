import { FileResult, STATUS } from './file-result.model.mjs';

/**
 * Immutable collection of per-file results plus computed summary.
 * Built once by CheckCommand with all data; never mutated afterwards.
 */
export class CheckResult {
  /**
   * @param {string} projectName - human-readable project name
   * @param {string} configName - config filename without extension
   * @param {Date} checkedAt - check timestamp
   * @param {FileResult[]} files - per-file results
   * @param {string} root - absolute project root path (from config.root)
   */
  constructor(projectName, configName, checkedAt, files, root) {
    this.projectName = projectName;
    this.configName = configName;
    this.checkedAt = checkedAt;
    this.root = root;
    this.files = Object.freeze([...files]);
    this.total = this.files.length;
    this.intact = this.files.filter((f) => f.status === STATUS.INTACT).length;
    this.violations = this.getViolations().length;
    this.warnings = this.getWarnings().length;
    this.passed = this.violations === 0;
    Object.freeze(this);
  }

  /**
   * Files with a violation status (MODIFIED or MISSING).
   * @returns {FileResult[]} violating files
   */
  getViolations() {
    return this.files.filter(
      (f) => f.status === STATUS.MODIFIED || f.status === STATUS.MISSING
    );
  }

  /**
   * Files with a warning status (NOT_CAPTURED or NOT_LOCKED).
   * @returns {FileResult[]} warning files
   */
  getWarnings() {
    return this.files.filter(
      (f) => f.status === STATUS.NOT_CAPTURED || f.status === STATUS.NOT_LOCKED
    );
  }
}
