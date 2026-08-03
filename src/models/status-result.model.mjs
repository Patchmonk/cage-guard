/**
 * Immutable result of a status query. Captures lock state and hash-store
 * metadata without re-hashing any file.
 */
export class StatusResult {
  /**
   * @param {string} projectName - human-readable project name
   * @param {string} configName - config filename without extension
   * @param {string} root - absolute project root path
   * @param {boolean} configLocked - whether the config file is read-only
   * @param {string|null} lastCapturedAt - ISO capture timestamp, or null
   * @param {string[]} protectedPatterns - protected patterns from the config
   * @param {number} fileCount - number of files in the hash store
   */
  constructor(
    projectName,
    configName,
    root,
    configLocked,
    lastCapturedAt,
    protectedPatterns,
    fileCount
  ) {
    this.projectName = projectName;
    this.configName = configName;
    this.root = root;
    this.configLocked = configLocked;
    this.lastCapturedAt = lastCapturedAt;
    this.protectedPatterns = protectedPatterns;
    this.fileCount = fileCount;
    Object.freeze(this);
  }
}