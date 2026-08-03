/**
 * Immutable, validated project configuration data.
 * Constructed once by ConfigLoader; never mutated afterwards.
 */
export class ProjectConfig {
  /**
   * @param {string} name - human-readable project name
   * @param {string} root - absolute project root path
   * @param {string[]} protectedPatterns - protected file patterns (deduplicated, no empty strings)
   * @param {string} configPath - absolute path to the config JSON file itself
   * @param {number} version - config schema version
   */
  constructor(name, root, protectedPatterns, configPath, version) {
    this.name = name;
    this.root = root;
    this.protected = protectedPatterns;
    this.configPath = configPath;
    this.version = version;
    Object.freeze(this);
  }
}
