/**
 * Immutable result for a project that failed to check (config error,
 * missing hash store, etc.). Shares the `passed` shape with CheckResult
 * so combined-summary logic can branch on data, never on instance type.
 */
export class CheckError {
  /**
   * @param {string} projectName - human-readable project name
   * @param {string} configName - config filename without extension
   * @param {string} error - error message
   */
  constructor(projectName, configName, error) {
    this.projectName = projectName;
    this.configName = configName;
    this.error = error;
    this.passed = false;
    Object.freeze(this);
  }
}