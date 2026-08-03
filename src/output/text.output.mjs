import { writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { CheckResult } from '../models/check-result.model.mjs';
import { STATUS } from '../models/file-result.model.mjs';
import {
  CHECK,
  CROSS,
  WARN,
  green,
  red,
  yellow,
} from '../utils/colors.util.mjs';
import { sanitizeFilename } from '../utils/paths.util.mjs';
import { Output } from './base.output.mjs';

/**
 * Human-readable output strategy. All text that reaches the terminal
 * flows through this class. The timestamp formatter is injectable so
 * tests can pin deterministic output.
 */
export class TextOutput extends Output {
  /**
   * @param {string} reportsDir - absolute path to the tool's reports/ directory
   * @param {(date: Date) => string} formatTimestamp - local-time formatter
   */
  constructor(reportsDir, formatTimestamp = defaultFormatTimestamp) {
    super();
    this._reportsDir = reportsDir;
    this._formatTimestamp = formatTimestamp;
  }

  /**
   * Print a yellow warning line to stdout.
   * @param {string} message - warning text
   */
  renderWarning(message) {
    process.stdout.write(`${yellow(`! ${message}`)}\n`);
  }

  /**
   * Print a red error line to stderr.
   * @param {string} message - error text
   */
  renderError(message) {
    process.stderr.write(`${red(message)}\n`);
  }

  /**
   * Print a plain informational message to stdout.
   * @param {string} message - message text
   */
  renderMessage(message) {
    process.stdout.write(`${message}\n`);
  }

  /**
   * Print the capture summary: green per-file confirmation and totals.
   * @param {ProjectConfig} config - loaded project config
   * @param {Array<{ relativePath: string, sha256: string, captured: boolean }>} fileEntries
   * @param {number} warningCount - number of warnings emitted during capture
   */
  renderCaptureResult(config, fileEntries, warningCount) {
    this._printHeader(`CAGE GUARD — ${config.name}`, `CAPTURE — ${this._now()}`);
    process.stdout.write('\n');
    for (const entry of fileEntries) {
      process.stdout.write(
        `  ${green(`${CHECK} ${entry.relativePath}`)} hashed + locked\n`
      );
    }
    const total = fileEntries.length;
    process.stdout.write(`\n  ${total}/${total} captured. Files are protected.\n`);
    if (warningCount > 0) {
      process.stdout.write(`  ${yellow(`${WARN} ${warningCount} warning(s) during capture.`)}\n`);
    }
    const configName = basename(config.configPath).replace(/\.json$/, '');
    process.stdout.write(`  Hash store: hashes/${configName}.hashes.json\n`);
  }

  /**
   * Print a capture that matched no files.
   * @param {ProjectConfig} config - loaded project config
   * @param {number} warningCount - number of warnings emitted during capture
   */
  renderEmptyCapture(config, warningCount) {
    this._printHeader(`CAGE GUARD — ${config.name}`, `CAPTURE — ${this._now()}`);
    process.stdout.write('\n');
    process.stdout.write('  No files matched any pattern in config. Nothing to capture.\n');
    if (warningCount > 0) {
      process.stdout.write(`  ${yellow(`${WARN} ${warningCount} warning(s) during capture.`)}\n`);
    }
  }

  /**
   * Print a per-file check result with colored statuses and a summary line.
   * @param {CheckResult} checkResult - computed check result
   */
  renderCheckResult(checkResult) {
    this._printHeader(
      `CAGE GUARD — ${checkResult.projectName}`,
      `CHECK — ${this._formatTimestamp(checkResult.checkedAt)}`
    );
    process.stdout.write('\n');
    for (const file of checkResult.files) {
      process.stdout.write(`  ${this._fileLine(file)}\n`);
    }
    const summary =
      `${checkResult.intact}/${checkResult.total} intact. ` +
      `${checkResult.violations} violations. ${checkResult.warnings} warnings.\n`;
    const color = checkResult.violations > 0 ? red : green;
    process.stdout.write(`\n  ${color(summary)}`);
  }

  /**
   * Print the agent-paste report block (Section 9 of the spec).
   * @param {CheckResult} checkResult - computed check result
   */
  renderAgentBlock(checkResult) {
    process.stdout.write(this.agentBlock(checkResult));
  }

  /**
   * Build the agent-paste report block text. Public and pure so tests
   * can assert the exact golden output without capturing stdout.
   * @param {CheckResult} checkResult - computed check result
   * @returns {string} the full report block text
   */
  agentBlock(checkResult) {
    const lines = [];
    lines.push('=== CAGE GUARD REPORT ===');
    lines.push(`Project:   ${checkResult.projectName}`);
    lines.push(`Config:    configs/${checkResult.configName}.json`);
    lines.push(`Root:      ${checkResult.root}`);
    lines.push(`Checked:   ${this._formatTimestamp(checkResult.checkedAt)}`);
    lines.push(`Status:    ${checkResult.violations > 0 ? 'VIOLATION' : 'OK'}`);
    lines.push('');
    this._appendModifiedSection(lines, checkResult.getViolations());
    this._appendMissingSection(lines, checkResult.getViolations());
    this._appendWarningSection(lines, checkResult.getWarnings());
    if (checkResult.violations > 0) {
      this._appendActionRequired(lines, checkResult.configName);
    }
    lines.push('=== END REPORT ===');
    return lines.join('\n') + '\n';
  }

  /**
   * Write the report file for a check. Filename is
   * <sanitized-project>-YYYY-MM-DD-HHMM.log. Failures print a warning.
   * @param {CheckResult} checkResult - computed check result
   * @returns {string|null} written file path, or null on failure
   */
  writeReportFile(checkResult) {
    const filename =
      `${sanitizeFilename(checkResult.projectName)}-` +
      `${this._timestampForFilename(checkResult.checkedAt)}.log`;
    const filePath = join(this._reportsDir, filename);
    try {
      writeFileSync(filePath, this.agentBlock(checkResult));
      return filePath;
    } catch {
      this.renderWarning(`Could not write report file: ${filePath}`);
      return null;
    }
  }

  /**
   * Print the combined multi-project summary. Results are CheckResult or
   * CheckError objects; the error branch is selected by the `error` data
   * field, never by instance type.
   * @param {Array<object>} results - CheckResult or CheckError objects
   */
  renderCombinedSummary(results) {
    this._printHeader('CAGE GUARD — ALL PROJECTS', `CHECK — ${this._now()}`);
    process.stdout.write('\n');
    let clean = 0;
    let violationCount = 0;
    let errorCount = 0;
    for (const result of results) {
      if (result.error) {
        errorCount += 1;
        process.stdout.write(`  ${this._combinedErrorLine(result)}\n`);
      } else {
        if (result.violations === 0) {
          clean += 1;
        } else {
          violationCount += result.violations;
        }
        process.stdout.write(`  ${this._combinedProjectLine(result)}\n`);
      }
    }
    const tally =
      `${clean}/${results.length} projects clean. ` +
      `${violationCount} violations. ${errorCount} errors.\n`;
    const color = clean === results.length ? green : red;
    process.stdout.write(`\n  ${color(tally)}`);
  }

  /**
   * Print a status summary: config lock state, last capture, pattern
   * count, and hash-store file count.
   * @param {StatusResult} statusResult - computed status result
   */
  renderStatusResult(statusResult) {
    this._printHeader(
      `CAGE GUARD — ${statusResult.projectName}`,
      `STATUS — ${this._now()}`
    );
    process.stdout.write('\n');
    const lock = statusResult.configLocked ? green('LOCKED') : yellow('UNLOCKED');
    process.stdout.write(`  Config: configs/${statusResult.configName}.json — ${lock}\n`);
    const lastCapture = statusResult.lastCapturedAt
      ? this._formatTimestamp(new Date(statusResult.lastCapturedAt))
      : 'never captured';
    process.stdout.write(`  Last capture: ${lastCapture}\n`);
    process.stdout.write(
      `  Protected patterns: ${statusResult.protectedPatterns.length}\n`
    );
    process.stdout.write(`  Files in hash store: ${statusResult.fileCount}\n`);
  }

  /**
   * Print scanner results grouped by profile plus folder pattern suggestions.
   * Text-only: init is interactive and never emits JSON.
   * @param {Object<string, string[]>} profiles - profile name → matched paths
   * @param {string[]} suggestions - suggested folder patterns
   */
  renderInitResults(profiles, suggestions) {
    this._printHeader('CAGE GUARD — INIT', '');
    process.stdout.write('\n');
    const profileNames = Object.keys(profiles);
    let total = 0;
    for (const profile of profileNames) {
      const paths = profiles[profile];
      total += paths.length;
      process.stdout.write(`  ${profile}:\n`);
      for (const matchedPath of paths) {
        process.stdout.write(`    ${green(`${CHECK} ${matchedPath}`)}\n`);
      }
      process.stdout.write('\n');
    }
    if (suggestions.length > 0) {
      process.stdout.write('  Suggested folder patterns:\n');
      for (const suggestion of suggestions) {
        process.stdout.write(`    ${suggestion}\n`);
      }
      process.stdout.write('\n');
    }
    process.stdout.write(
      `  ${total} files detected across ${profileNames.length} profiles.\n`
    );
    process.stdout.write('\n');
  }

  /**
   * Print the interactive project picker with per-project lock state.
   * Entries are data objects: error projects are reported in red without
   * breaking the list. The final line prompts for a 1-based selection.
   * @param {Array<{ name: string, fileCount: number, lockedCount: number, hasStore: boolean, error: string|null }>} entries
   */
  renderProjectPicker(entries) {
    this._printHeader('CAGE GUARD — LOCKER TOOL', '');
    process.stdout.write('\n');
    process.stdout.write('  📂 Protected projects found:\n');
    entries.forEach((entry, index) => {
      process.stdout.write(`  ${index + 1}. ${entry.name}\n`);
      process.stdout.write(`    ${this._lockStateLine(entry)}\n`);
    });
    process.stdout.write('\n');
    process.stdout.write('  Select a project (1-N) or (Q)uit:\n');
  }

  /**
   * Print the action menu for one project: header, project name, current
   * lock state, and the numbered actions. The lock-state line reuses the
   * same logic as the picker.
   * @param {object} entry - one picker entry ({ name, fileCount, lockedCount, hasStore, error })
   */
  renderActionMenu(entry) {
    this._printHeader('CAGE GUARD — LOCKER TOOL', '');
    process.stdout.write('\n');
    process.stdout.write(`  📂 Project: ${entry.name}\n`);
    process.stdout.write(`    ${this._lockStateLine(entry)}\n`);
    process.stdout.write('\n');
    process.stdout.write('  1) Lock (capture)\n');
    process.stdout.write('  2) Unlock\n');
    process.stdout.write('  3) Check\n');
    process.stdout.write('  4) Status\n');
    process.stdout.write('  (B)ack  (Q)uit\n');
  }

  /**
   * Print the tool-protect result: a green total line, a red warning per
   * path that failed to lock or unlock, and a note that project files are
   * owned by capture. Action is 'LOCK' or 'UNLOCK'.
   * @param {string} action - 'LOCK' or 'UNLOCK'
   * @param {number} total - number of files successfully protected
   * @param {string[]} failedPaths - paths that could not be locked or unlocked
   */
  renderToolProtectResult(action, total, failedPaths) {
    this._printHeader('CAGE GUARD — PROTECT TOOL', '');
    process.stdout.write('\n');
    const verb = action === 'LOCK' ? 'Locked' : 'Unlocked';
    const glyph = action === 'LOCK' ? '✅' : '🔓';
    process.stdout.write(`  ${green(`${glyph} ${verb} ${total} files`)}\n`);
    const failVerb = action === 'LOCK' ? 'Could not lock' : 'Could not unlock';
    for (const failedPath of failedPaths) {
      process.stdout.write(`  ${red(`${WARN} ${failVerb}: ${failedPath}`)}\n`);
    }
    process.stdout.write('\n');
    process.stdout.write(
      '  Project files are managed by capture — this command protects the tool source only.\n'
    );
  }

  /**
   * One combined-summary line for a successful or violating project.
   * @param {object} result - CheckResult
   * @returns {string} colored summary line
   */
  _combinedProjectLine(result) {
    if (result.violations === 0) {
      return green(
        `${CHECK} ${result.projectName}  ${result.intact}/${result.total} intact`
      );
    }
    return red(
      `${CROSS} ${result.projectName}  ${result.intact}/${result.total} intact — ` +
        `${result.violations} violations`
    );
  }

  /**
   * One combined-summary line for a project error object.
   * @param {object} result - CheckError
   * @returns {string} red error line
   */
  _combinedErrorLine(result) {
    return red(`${CROSS} ${result.projectName}  ERROR: ${result.error}`);
  }

  /**
   * One colored lock-state line for a picker or action-menu entry.
   * Error projects are red; missing baselines, full locks, and partial
   * locks each get their own state color and wording.
   * @param {object} entry - picker entry ({ name, fileCount, lockedCount, hasStore, error })
   * @returns {string} colored lock-state line
   */
  _lockStateLine(entry) {
    if (entry.error) {
      return red(`${WARN} ${entry.error}`);
    }
    const fileCount = entry.fileCount || 0;
    if (!entry.hasStore || fileCount === 0) {
      return yellow(`${WARN} no baseline yet — needs lock`);
    }
    const lockedCount = entry.lockedCount || 0;
    if (lockedCount === fileCount) {
      return green(`${CHECK} ${fileCount} files locked`);
    }
    if (lockedCount === 0) {
      return yellow(`${WARN} ${fileCount} files unlocked`);
    }
    return yellow(
      `${WARN} ${fileCount} files (${lockedCount} locked, ${fileCount - lockedCount} unlocked)`
    );
  }

  /**
   * Append the MODIFIED FILES section to the report lines.
   * @param {string[]} lines - report lines being built
   * @param {Array} violations - MODIFIED or MISSING results
   */
  _appendModifiedSection(lines, violations) {
    const modified = violations.filter((f) => f.status === STATUS.MODIFIED);
    if (modified.length === 0) {
      return;
    }
    lines.push('MODIFIED FILES:');
    for (const file of modified) {
      lines.push(`  ${file.relativePath}`);
      lines.push(`    expected: ${file.expectedHash}`);
      lines.push(`    actual:   ${file.actualHash}`);
      lines.push(`    modified: ${this._formatTimestamp(file.modifiedAt)}`);
    }
    lines.push('');
  }

  /**
   * Append the MISSING FILES section to the report lines.
   * @param {string[]} lines - report lines being built
   * @param {Array} violations - MODIFIED or MISSING results
   */
  _appendMissingSection(lines, violations) {
    const missing = violations.filter((f) => f.status === STATUS.MISSING);
    if (missing.length === 0) {
      return;
    }
    lines.push('MISSING FILES:');
    for (const file of missing) {
      lines.push(`  ${file.relativePath}`);
      lines.push(`    expected: ${file.expectedHash}`);
    }
    lines.push('');
  }

  /**
   * Append the WARNINGS section to the report lines.
   * @param {string[]} lines - report lines being built
   * @param {Array} warnings - NOT_CAPTURED or NOT_LOCKED results
   */
  _appendWarningSection(lines, warnings) {
    if (warnings.length === 0) {
      return;
    }
    lines.push('WARNINGS:');
    for (const file of warnings) {
      const detail =
        file.status === STATUS.NOT_LOCKED
          ? 'hash matches but file is not locked'
          : 'listed in config but never captured';
      lines.push(`  ${file.relativePath} — ${detail}`);
    }
    lines.push('');
  }

  /**
   * Append the ACTION REQUIRED section to the report lines.
   * @param {string[]} lines - report lines being built
   * @param {string} configName - config filename without extension
   */
  _appendActionRequired(lines, configName) {
    lines.push('ACTION REQUIRED:');
    lines.push('  Protected files were modified or deleted.');
    lines.push('  Revert ALL modifications to your last known good state.');
    lines.push('  Do not continue building on a modified foundation.');
    lines.push("  After reverting, re-run your project's validation process.");
    lines.push('  If the modification was intentional and authorized by the');
    lines.push(`  project owner, re-run: node guard.mjs capture ${configName}`);
  }

  /**
   * One colored console line for a single file result.
   * Renders a STATUS data value; the closed enum is data, not object type.
   * @param {object} file - FileResult
   * @returns {string} colored status line
   */
  _fileLine(file) {
    switch (file.status) {
      case STATUS.INTACT:
        return green(`${CHECK} ${file.relativePath}`);
      case STATUS.MODIFIED:
        return red(`${CROSS} ${file.relativePath} MODIFIED`);
      case STATUS.MISSING:
        return red(`${CROSS} ${file.relativePath} MISSING`);
      case STATUS.NOT_CAPTURED:
        return yellow(`${WARN} ${file.relativePath} NOT CAPTURED`);
      case STATUS.NOT_LOCKED:
        return yellow(`${WARN} ${file.relativePath} NOT LOCKED`);
      default:
        return file.relativePath;
    }
  }

  /**
   * Print the boxed header used by every command output section.
   * @param {string} title - first header line
   * @param {string} subtitle - second header line (may be empty)
   */
  _printHeader(title, subtitle) {
    process.stdout.write(`╔${'═'.repeat(38)}╗\n`);
    process.stdout.write(`║  ${title.padEnd(34)}  ║\n`);
    if (subtitle !== '') {
      process.stdout.write(`║  ${subtitle.padEnd(34)}  ║\n`);
    }
    process.stdout.write(`╚${'═'.repeat(38)}╝\n`);
  }

  /**
   * Format a date for report filenames: YYYY-MM-DD-HHMM (no colons, no T).
   * @param {Date} date - date to format
   * @returns {string} filename-safe timestamp
   */
  _timestampForFilename(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return (
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-` +
      `${pad(date.getHours())}${pad(date.getMinutes())}`
    );
  }

  /**
   * Current local time formatted via the injectable formatter.
   * @returns {string} formatted timestamp
   */
  _now() {
    return this._formatTimestamp(new Date());
  }
}

/**
 * Default local-time formatter: YYYY-MM-DD HH:MM:SS.
 * @param {Date} date - date to format
 * @returns {string} formatted timestamp
 */
export function defaultFormatTimestamp(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}