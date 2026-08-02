import { dirname, relative } from 'node:path';

import {
  DETECTION_PROFILES,
  SKIP_DIRECTORIES,
} from '../data/detection-profiles.mjs';
import { walkDir, wildcardToRegex } from '../utils/paths.util.mjs';

/**
 * Scans a project directory and matches files against the detection
 * profiles. Returns data only — it never writes configs, hashes, locks,
 * or prints anything.
 */
export class Scanner {
  /**
   * Walk a project and return every file matched by any detection profile.
   * Relative paths use forward slashes. Filename patterns like
   * "package.json" match only at the project root; folder patterns like
   * "scripts/**" match any file under that folder.
   * @param {string} projectPath - absolute project directory
   * @returns {Array<{ profile: string, pattern: string, matchedPath: string }>}
   */
  scan(projectPath) {
    const results = [];
    const seen = new Set();
    const files = walkDir(projectPath, true, SKIP_DIRECTORIES);
    for (const absolutePath of files) {
      const relPath = relative(projectPath, absolutePath).replace(/\\/g, '/');
      for (const [profile, patterns] of Object.entries(DETECTION_PROFILES)) {
        for (const pattern of patterns) {
          const regex = wildcardToRegex(pattern);
          if (regex.test(relPath)) {
            const key = `${profile}\u0000${pattern}\u0000${relPath}`;
            if (!seen.has(key)) {
              seen.add(key);
              results.push({ profile, pattern, matchedPath: relPath });
            }
          }
        }
      }
    }
    return results;
  }

  /**
   * Suggest folder patterns from scan matches: group matched files by
   * parent directory; when 2+ files share a parent and that parent is
   * not the project root, suggest <parent>/**.
   * @param {Array<{ profile: string, pattern: string, matchedPath: string }>} matches
   * @returns {string[]} suggested folder patterns
   */
  suggestFolderPatterns(matches) {
    const byParent = new Map();
    for (const match of matches) {
      const parent = dirname(match.matchedPath);
      const normalized = parent === '.' ? '' : parent;
      if (!byParent.has(normalized)) {
        byParent.set(normalized, []);
      }
      byParent.get(normalized).push(match.matchedPath);
    }
    const suggestions = [];
    for (const [parent, files] of byParent) {
      if (parent !== '' && files.length >= 2) {
        suggestions.push(`${parent}/**`);
      }
    }
    return suggestions;
  }
}
