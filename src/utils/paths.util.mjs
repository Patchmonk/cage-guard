import { existsSync, mkdirSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { SKIP_DIRECTORIES } from '../data/detection-profiles.mjs';

/**
 * Path utilities: directory creation, path checks, filename sanitizing,
 * wildcard pattern expansion, and directory walking.
 * Never prints anything. All warnings are returned to the caller.
 */

/**
 * Create tool directories (configs/, hashes/, reports/) under toolRoot.
 * @param {string} toolRoot - absolute tool root path
 */
export function ensureDirectories(toolRoot) {
  for (const name of ['configs', 'hashes', 'reports']) {
    mkdirSync(join(toolRoot, name), { recursive: true });
  }
}

/**
 * Check whether a path is absolute (POSIX "/" or Windows drive prefix).
 * @param {string} p - path to test
 * @returns {boolean} true if the path is absolute
 */
export function isAbsolutePath(p) {
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p);
}

/**
 * Sanitize a filename: replace dangerous characters and spaces with hyphens,
 * collapse consecutive hyphens, and trim leading/trailing hyphens.
 * @param {string} name - raw name to sanitize
 * @returns {string} sanitized name
 */
export function sanitizeFilename(name) {
  return name
    .replace(/[:*?"<>|\/\\ ]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Expand protected patterns into absolute file paths plus warnings.
 * @param {string} root - absolute project root
 * @param {string[]} patterns - protected patterns from the config
 * @returns {{ paths: string[], warnings: string[] }} expanded paths and warnings
 */
export function expandPatterns(root, patterns) {
  const paths = [];
  const warnings = [];
  const warned = new Set();
  for (const pattern of patterns) {
    const matched = expandOne(root, pattern, warnings, warned);
    if (matched.length === 0 && !warned.has(pattern)) {
      warnings.push(`Pattern matched 0 files: ${pattern}`);
    }
    paths.push(...matched);
  }
  const unique = [...new Set(paths)];
  return { paths: unique.filter((p) => !isDirectory(p)), warnings };
}

/**
 * Expand a single pattern by dispatching to the matching rule.
 * @param {string} root - absolute project root
 * @param {string} pattern - one protected pattern
 * @param {string[]} warnings - collected warnings
 * @param {Set<string>} warned - patterns already warned about
 * @returns {string[]} matched absolute file paths
 */
function expandOne(root, pattern, warnings, warned) {
  if (!pattern.includes('*')) {
    return expandExact(root, pattern);
  }
  if (pattern.endsWith('/**') || pattern.endsWith('\\**')) {
    return expandRecursive(root, pattern, warnings, warned);
  }
  if (pattern.includes('**')) {
    throw new Error(
      `Pattern not supported in v1: ${pattern}. Use folder/** or folder/* instead.`
    );
  }
  if (pattern.endsWith('/*') || pattern.endsWith('\\*')) {
    return expandDepthOne(root, pattern, warnings, warned);
  }
  return expandFilenameWildcard(root, pattern, warnings, warned);
}

/**
 * Rule: exact relative path with no wildcards. Directories are skipped.
 * Missing files are kept so checks can report them as MISSING.
 * @param {string} root - absolute project root
 * @param {string} pattern - relative file path
 * @returns {string[]} matched absolute paths
 */
function expandExact(root, pattern) {
  const abs = join(root, pattern);
  try {
    if (statSync(abs).isDirectory()) return [];
  } catch {
    // File does not exist on disk; keep the path for the missing-file report.
  }
  return [abs];
}

/**
 * Rule: `folder/**` recursive walk.
 * @param {string} root - absolute project root
 * @param {string} pattern - pattern ending in /**
 * @param {string[]} warnings - collected warnings
 * @param {Set<string>} warned - patterns already warned about
 * @returns {string[]} matched absolute file paths
 */
function expandRecursive(root, pattern, warnings, warned) {
  const dir = join(root, pattern.slice(0, -3));
  if (!existsSync(dir)) {
    warnings.push(`Directory not found for pattern: ${pattern}`);
    warned.add(pattern);
    return [];
  }
  return walkDir(dir, true, SKIP_DIRECTORIES);
}

/**
 * Rule: `folder/*` depth-1 walk.
 * @param {string} root - absolute project root
 * @param {string} pattern - pattern ending in /*
 * @param {string[]} warnings - collected warnings
 * @param {Set<string>} warned - patterns already warned about
 * @returns {string[]} matched absolute file paths
 */
function expandDepthOne(root, pattern, warnings, warned) {
  const dir = join(root, pattern.slice(0, -2));
  if (!existsSync(dir)) {
    warnings.push(`Directory not found for pattern: ${pattern}`);
    warned.add(pattern);
    return [];
  }
  return walkDir(dir, false, SKIP_DIRECTORIES);
}

/**
 * Rule: wildcard in the filename segment only (e.g. `*.config.*`, `src/*.ts`).
 * Walks the directory prefix (or project root) at depth 1 and matches names.
 * @param {string} root - absolute project root
 * @param {string} pattern - wildcard pattern
 * @param {string[]} warnings - collected warnings
 * @param {Set<string>} warned - patterns already warned about
 * @returns {string[]} matched absolute file paths
 */
function expandFilenameWildcard(root, pattern, warnings, warned) {
  const slashIdx = Math.max(pattern.lastIndexOf('/'), pattern.lastIndexOf('\\'));
  const dir = slashIdx >= 0 ? join(root, pattern.slice(0, slashIdx)) : root;
  const portion = slashIdx >= 0 ? pattern.slice(slashIdx + 1) : pattern;
  if (!existsSync(dir)) {
    warnings.push(`Directory not found for pattern: ${pattern}`);
    warned.add(pattern);
    return [];
  }
  const regex = wildcardToRegex(portion);
  return walkDir(dir, false, SKIP_DIRECTORIES).filter((file) =>
    regex.test(basename(file))
  );
}

/**
 * Convert a wildcard pattern to an anchored RegExp.
 * `**` becomes `.*`, `*` becomes `[^/\\]*`, `.` becomes `\\.`,
 * and both `/` and `\` become `[/\\]`.
 * @param {string} pattern - glob pattern
 * @returns {RegExp} anchored matcher
 */
export function wildcardToRegex(pattern) {
  let out = '^';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*' && pattern[i + 1] === '*') {
      out += '.*';
      i++;
    } else if (ch === '*') {
      out += '[^/\\\\]*';
    } else if (ch === '.') {
      out += '\\.';
    } else if (ch === '/' || ch === '\\') {
      out += '[/\\\\]';
    } else {
      out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(out + '$');
}

/**
 * Walk a directory and return absolute file paths.
 * Only directories whose name is in skipDirs are skipped (no blanket
 * dot-directory rule). Real paths are tracked to prevent symlink loops.
 * @param {string} dir - absolute directory to walk
 * @param {boolean} recursive - descend into subdirectories
 * @param {string[]} skipDirs - directory names to skip
 * @returns {string[]} absolute file paths
 */
export function walkDir(dir, recursive, skipDirs) {
  const results = [];
  const visited = new Set();
  walkDirInto(dir, recursive, skipDirs, results, visited);
  return results;
}

/**
 * Internal walker for one directory level.
 * @param {string} dir - absolute directory to walk
 * @param {boolean} recursive - descend into subdirectories
 * @param {string[]} skipDirs - directory names to skip
 * @param {string[]} results - accumulated file paths
 * @param {Set<string>} visited - real paths already walked
 */
function walkDirInto(dir, recursive, skipDirs, results, visited) {
  let real;
  try {
    real = realpathSync(dir);
  } catch {
    return; // Broken symlink or unreadable directory: skip silently.
  }
  if (visited.has(real)) return;
  visited.add(real);
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // Unreadable subdirectory: skip silently.
  }
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skipDirs.includes(entry.name)) continue;
      if (recursive) walkDirInto(abs, recursive, skipDirs, results, visited);
    } else if (entry.isFile()) {
      results.push(abs);
    } else if (entry.isSymbolicLink()) {
      followSymlink(abs, entry.name, recursive, skipDirs, results, visited);
    }
  }
}

/**
 * Follow a symbolic link to its target; skip broken links silently.
 * @param {string} abs - absolute path of the link
 * @param {string} name - link name (checked against skipDirs)
 * @param {boolean} recursive - descend into linked directories
 * @param {string[]} skipDirs - directory names to skip
 * @param {string[]} results - accumulated file paths
 * @param {Set<string>} visited - real paths already walked
 */
function followSymlink(abs, name, recursive, skipDirs, results, visited) {
  let real;
  try {
    real = realpathSync(abs);
  } catch {
    return; // Broken symlink: skip silently.
  }
  let stats;
  try {
    stats = statSync(real);
  } catch {
    return; // Target unreadable: skip silently.
  }
  if (stats.isDirectory()) {
    if (skipDirs.includes(name) || !recursive) return;
    if (visited.has(real)) return;
    visited.add(real);
    walkDirInto(real, recursive, skipDirs, results, visited);
  } else if (stats.isFile()) {
    results.push(abs);
  }
}

/**
 * Check whether a path is a directory on disk.
 * @param {string} p - absolute path to test
 * @returns {boolean} true if the path is a directory
 */
function isDirectory(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}
