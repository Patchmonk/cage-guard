---

# CAGE-GUARD v1.0 — FINAL BUILD INSTRUCTION

**Version:** 1.0-final
**Date:** 2026-08-03
**Status:** APPROVED FOR IMPLEMENTATION. All reviews merged. No outstanding issues.

---

## 1. TASK

Build a standalone, multi-project file integrity checker called `cage-guard`. Node.js. Zero dependencies. Object-oriented. SOLID principles. It reads config files that define which files to protect in which project. It hashes them. It compares them. It reports green or red. It produces a shareable report. It auto-detects known config files during onboarding. It supports folder-level protection via glob patterns. It is project-blind — it does not know what any file is or what any project does. It checks if bytes changed. That is all.

## 2. CONSTRAINTS

```
- Object-oriented. SOLID. One class per file. Constructor injection.
- ES modules (.mjs). Node.js built-ins only. Zero dependencies.
- No package.json. No node_modules. No npm install. No third-party packages.
- No chalk. No commander. No yargs. No glob. No minimatch.
- ANSI colors via escape codes in colors.util.mjs.
- Folder structure EXACTLY as Section 3. Do not add or remove files.
- Commands extend CommandBase. Registered in a Map in guard.mjs.
- Services do ONE thing. ConfigLoader loads. HashStore hashes. FileLock locks.
  Report outputs. Scanner detects.
- Models are plain data objects. Immutable after creation.
- No function longer than 30 lines. If a method exceeds 20 lines, pause and
  split into private helpers. This limit is real. InitCommand and CheckCommand
  will need aggressive extraction. Plan for it.
- No global state. No singletons. No magic strings.
- Status values are named constants exported from file-result.model.mjs.
- JSDoc comment on every public method.
- Errors thrown with clear messages. Caught ONCE at top level in guard.mjs.
  Printed to process.stderr.write. Exit 1. No stack trace.
- No console.log anywhere. Report methods use process.stdout.write.
  Error messages use process.stderr.write.
- Utils NEVER print. expandPatterns returns warnings; the caller prints them
  via Report. walkDir returns paths; it does not print.
- fs.chmodSync for permissions. NEVER shell out to attrib or icacls.
- All project paths resolved from config.root (absolute). NEVER from
  process.cwd() at check/capture time.
- Tool directories (configs/, hashes/, reports/) resolved from the tool's OWN
  location via import.meta.url. NEVER from process.cwd(). See Section 4.
- Report filenames: YYYY-MM-DD-HHMM. No colons. No T character.
  Project name sanitized.
- Hashing uses Buffer (readFileSync with NO encoding). Never UTF-8.
- Hash store keys are relative paths (from config.root). Never absolute.
- Do NOT add commands, flags, or features not in this spec.
- Do NOT open a browser to research.
- If stuck for 2 attempts, STOP and report the exact error.
```

## 3. FOLDER STRUCTURE

```
cage-guard/
│
├── guard.mjs                            ← entry point
│
├── src/
│   ├── commands/
│   │   ├── command.base.mjs             ← abstract base class
│   │   ├── init.command.mjs             ← onboarding: scan, suggest, write config
│   │   ├── capture.command.mjs          ← hash and lock
│   │   └── check.command.mjs            ← verify and report
│   │
│   ├── services/
│   │   ├── config-loader.service.mjs    ← read, validate, list, write configs
│   │   ├── hash-store.service.mjs       ← compute, persist, compare hashes
│   │   ├── file-lock.service.mjs        ← set, remove, check read-only
│   │   ├── report.service.mjs           ← console output, file reports, agent block
│   │   └── scanner.service.mjs          ← scan project, match detection profiles
│   │
│   ├── models/
│   │   ├── project-config.model.mjs     ← validated config data
│   │   ├── file-result.model.mjs        ← one file's result + STATUS constants
│   │   └── check-result.model.mjs       ← collection of results + summary
│   │
│   ├── data/
│   │   └── detection-profiles.mjs       ← default patterns + skip directories
│   │
│   └── utils/
│       ├── colors.util.mjs              ← ANSI escape helpers
│       └── paths.util.mjs               ← path resolution, dir creation, pattern
│                                           expansion, directory walk
│
├── configs/                             ← one JSON per project
│   └── .gitkeep
│
├── hashes/                              ← one hash store per project
│   └── .gitkeep
│
├── reports/                             ← generated report logs
│   └── .gitkeep
│
├── check-all.bat                        ← double-click: check ALL projects
│
├── protect-tool.bat                     ← double-click: protect tool source
│                                           (NOT data dirs)
│
└── README.md
```

## 4. TOOL DIRECTORY RESOLUTION — CRITICAL

The tool must know its own location regardless of where the user runs it from. If the user runs `node C:\Tools\cage-guard\guard.mjs check` from `C:\Users\You\Desktop`, the tool must look for configs in `C:\Tools\cage-guard\configs\`, not `C:\Users\You\Desktop\configs\`.

In `guard.mjs`, at the top:

```javascript
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const TOOL_ROOT = dirname(__filename);
const CONFIGS_DIR = join(TOOL_ROOT, 'configs');
const HASHES_DIR = join(TOOL_ROOT, 'hashes');
const REPORTS_DIR = join(TOOL_ROOT, 'reports');
```

Pass `TOOL_ROOT`, `CONFIGS_DIR`, `HASHES_DIR`, `REPORTS_DIR` to services via constructor injection. No service ever calls `process.cwd()` to find tool directories.

The ONLY place `process.cwd()` is used: the `init` command resolves the user-provided project path if it is relative. `path.resolve(process.cwd(), userArg)`. This resolved absolute path is stored in the config. After that, CWD is never used again.

## 5. CLASS ARCHITECTURE

### 5.1 guard.mjs — Entry Point

Not a class. A script.

- Resolve `TOOL_ROOT` via `import.meta.url` (Section 4).
- Call `ensureDirectories(TOOL_ROOT)` to create `configs/`, `hashes/`, `reports/` if missing.
- Instantiate services with tool directories injected.
- Instantiate commands with services injected.
- Register in a Map: `'init'` → InitCommand, `'capture'` → CaptureCommand, `'check'` → CheckCommand.
- Parse `process.argv[2]` (command) and `process.argv[3]` (argument).
- Validate arguments BEFORE dispatching:
  - `init` with no path → `"Project path required. Usage: node guard.mjs init <path>"`. Exit 1.
  - `capture` with no name → `"Project name required. Usage: node guard.mjs capture <name>"`. Exit 1.
  - `check` with no name → valid. Runs `executeAll()`.
  - Unknown command → `"Unknown command: <cmd>. Available: init, capture, check."`. Exit 1.
  - No command at all → interactive mode: list configs via `ConfigLoader.listAll()`, prompt user to select, run check on selection. If stdin is not a TTY, print the list and exit 1 with `"Run interactively or specify a project name."`.
- Wrap ALL logic in try/catch. Catch: `process.stderr.write(error.message + '\n')`. `process.exit(1)`. No stack trace.

### 5.2 CommandBase — Abstract Base Class

```javascript
/**
 * Abstract base class for all commands.
 * All commands receive dependencies via constructor injection.
 */
class CommandBase {
  /**
   * @param {ConfigLoader} configLoader
   * @param {HashStore} hashStore
   * @param {FileLock} fileLock
   * @param {Report} report
   */
  constructor(configLoader, hashStore, fileLock, report) { }

  /**
   * Execute the command for a named project.
   * @param {string} name - config filename without extension
   */
  async execute(name) { throw new Error('not implemented'); }
}
```

### 5.3 InitCommand

Extends CommandBase. Additional dependency: Scanner (injected via constructor).

`execute(projectPath)`:
1. If `projectPath` is not absolute, resolve via `path.resolve(process.cwd(), projectPath)`.
2. Validate directory exists. If not: throw `"Project path not found: <path>"`.
3. Derive project name from folder name via `sanitizeFilename()`.
4. Check if `configs/<name>.json` already exists:
   - If exists: prompt `"Config already exists: configs/<name>.json. Overwrite? [Y/n]"`.
   - If `n` → print `"Aborted."`. Exit 0.
   - If `Y` → if file is read-only, unlock via `FileLock.unlock()`. Proceed.
5. Call `Scanner.scan(projectPath)`. Returns matches grouped by profile.
6. Call `Scanner.suggestFolderPatterns(matches)`. Guard: if the common parent directory is the project root itself, do NOT suggest a folder pattern. List the files individually. Never suggest `/**` for the project root.
7. Print results grouped by profile via `Report.printInitResults()`.
8. Prompt: `"Protect these N files? [Y/n/edit]"`.
   - `Y` or empty → write config.
   - `n` → `"Aborted. No config written."`. Exit 0.
   - `edit` → print numbered list. Read commands from stdin: `remove <number>`, `add <pattern>`, `done`. Invalid input → print `"Unknown command. Use: remove <n>, add <pattern>, done"`. Loop until `done`.
9. Write `configs/<name>.json` via `ConfigLoader.write()`.
10. Print: `"Config written: configs/<name>.json. Next step: node guard.mjs capture <name>"`.
11. Close readline interface. `rl.close()`.

### 5.4 CaptureCommand

Extends CommandBase.

`execute(name)`:
1. Load config via `ConfigLoader.load(name)`.
2. Expand patterns: `const { paths, warnings } = expandPatterns(config.root, config.protected)`.
3. Print each warning via `Report.printWarning(warning)`.
4. If `paths` is empty: print `"No files matched any pattern in config. Nothing to capture."`. Exit 0.
5. For each absolute file path in `paths`:
   - If missing on disk: print yellow warning via Report. Skip.
   - Compute SHA-256 via `HashStore.compute(filePath)`. Uses Buffer, not UTF-8.
   - Set read-only via `FileLock.lock(filePath)`. If lock returns false, print yellow warning via Report. Do not crash. Continue.
6. Convert each absolute path to relative: `path.relative(config.root, absolutePath).replace(/\\/g, '/')`. Build array of `{ relativePath, sha256, captured }` objects.
7. Save via `HashStore.save(name, fileEntries)`. HashStore handles unlock/write/relock of the hash store file internally.
8. Lock config file via `FileLock.lock(config.configPath)`. If returns false, print warning. Do not crash.
9. Print summary via `Report.printCaptureSummary(config, fileEntries)`.

### 5.5 CheckCommand

Extends CommandBase.

`execute(name)`:
1. Load config via `ConfigLoader.load(name)`.
2. Load hash store via `HashStore.load(name)`.
   - If null: throw `"No hash store found. Run: node guard.mjs capture <name>"`.
   - If corrupted (JSON parse error): throw `"Hash store corrupted: hashes/<name>.hashes.json. Run capture to regenerate."`.
3. Expand patterns: `const { paths, warnings } = expandPatterns(config.root, config.protected)`.
4. Print each warning via `Report.printWarning(warning)`.
5. For each absolute file path in `paths`, build a `FileResult`:
   - Convert to relative path for hash store lookup: `path.relative(config.root, absolutePath).replace(/\\/g, '/')`.
   - Not in hash store → status `NOT_CAPTURED`.
   - Missing on disk → status `MISSING`.
   - Hash mismatch → status `MODIFIED`. Include expected hash (first 12 chars), actual hash (first 12 chars), file mtime.
   - Hash match but writable (via `FileLock.isLocked` returning false) → status `NOT_LOCKED`.
   - Hash match and read-only → status `INTACT`.
6. Build `CheckResult` from all `FileResult` objects.
7. Print via `Report.printCheckResult(checkResult)`.
8. If violations exist: print agent-paste block via `Report.printAgentBlock(checkResult)`.
9. Write report file via `Report.writeReportFile(checkResult)`. If write fails (permissions), print yellow warning. Do not throw. Console output is already printed.
10. Exit 0 if no `MODIFIED` or `MISSING`. Exit 1 otherwise. Warnings alone do not cause exit 1.

`executeAll()`:
1. `ConfigLoader.listAll()`. If empty: throw `"No configs found in configs/. Run init first."`.
2. For each config name, wrap check logic in its own try/catch:
   - Success → push `CheckResult` to results array.
   - Failure → push error object `{ configName, projectName, error: error.message }` to results array. Print red error for that project. Continue to next.
3. Print combined summary via `Report.printCombinedSummary(results)`.
4. Exit 1 if ANY result is a violation OR an error. Exit 0 only if all pass.

### 5.6 ConfigLoader

Responsibilities: discover, read, validate, write config files. Nothing else.

Methods:
- `load(name)` → read `configs/<name>.json`. Parse JSON. If file missing: throw `"Config not found: configs/<name>.json"`. If parse fails: throw `"Invalid JSON in configs/<name>.json: <message>"`. Validate. Return `ProjectConfig`.
- `listAll()` → scan `configs/` for `.json` files (exclude `.gitkeep`). Return array of names (filename without `.json` extension).
- `validate(data)` → check each field with specific error messages:
  - `name` missing or not string → `"Config 'name' must be a non-empty string."`
  - `root` missing or not string → `"Config 'root' must be a non-empty string."`
  - `root` not absolute → `"Config 'root' must be an absolute path. Got: <root>"`
  - `root` directory does not exist → `"Project root not found: <root>"`
  - `protected` missing, not array, or empty → `"Config 'protected' must be a non-empty array of strings."`
  - Filter out empty strings and duplicates from `protected`.
- `write(name, data)` → write `configs/<name>.json` with 2-space indentation.

Does not hash. Does not lock. Does not report. Does not scan.

### 5.7 HashStore

Responsibilities: compute hashes, persist hash stores, load hash stores. Nothing else.

Methods:
- `compute(filePath)` → `readFileSync(filePath)` with NO encoding parameter (returns Buffer). `createHash('sha256').update(buffer).digest('hex')`. If read fails with EBUSY or EPERM: throw `"Cannot read <filePath>: locked by another process."`.
- `save(name, fileEntries)` → build hash store object with relative path keys. If `hashes/<name>.hashes.json` exists and is read-only: unlock via injected `FileLock.unlock()`. Write JSON (2-space indent). Lock via `FileLock.lock()`. All permission handling is internal to this method.
- `load(name)` → read `hashes/<name>.hashes.json`. If file missing: return null. If JSON parse fails: throw `"Hash store corrupted: hashes/<name>.hashes.json"`.

Does not lock project files. Does not print. Does not expand patterns.

### 5.8 FileLock

Responsibilities: set read-only, remove read-only, check read-only. Nothing else.

Methods:
- `lock(filePath)` → `chmodSync(filePath, 0o444)`. If fails: return `false`. Do not throw.
- `unlock(filePath)` → `chmodSync(filePath, 0o666)`. If fails: return `false`. Do not throw.
- `isLocked(filePath)` → if `existsSync(filePath)` is false: return `false`. Try `accessSync(filePath, fs.constants.W_OK)`. If throws: return `true` (locked). If succeeds: return `false` (writable).

Does not hash. Does not report. Does not know what a config is.

### 5.9 Report

Responsibilities: ALL output. Console, file, agent-paste block. Nothing else. No other module prints.

Methods:
- `printCaptureSummary(config, fileEntries)` → green per-file confirmation + total.
- `printCheckResult(checkResult)` → colored per-file status + summary line.
- `printAgentBlock(checkResult)` → the copy-paste block (Section 9).
- `writeReportFile(checkResult)` → sanitize project name via `sanitizeFilename()`. Filename: `<sanitized>-YYYY-MM-DD-HHMM.log`. Write to `reports/`. If write fails: print yellow warning to console. Do not throw. Return file path or null.
- `printCombinedSummary(results)` → handle both `CheckResult` instances and error objects `{ configName, projectName, error }`. For CheckResult: print project summary line (green or red). For error objects: print project name in red followed by `"ERROR: <message>"`.
- `printWarning(message)` → print yellow warning line to stdout.
- `printInitResults(profiles, suggestions)` → print scanner results grouped by profile + folder pattern suggestions.

All output via `process.stdout.write`. No `console.log`.

### 5.10 Scanner

Responsibilities: scan a project directory, match files against detection profiles. Nothing else.

Methods:
- `scan(projectPath)` → walk the project directory recursively via `walkDir`. NO depth limit. Skip directories in `SKIP_DIRECTORIES` only. For each file found, compute its full relative path from the project root using forward slashes (e.g., `.github/workflows/ci.yml`). Match this full relative path against every pattern in every profile of `DETECTION_PROFILES`. Filename patterns like `package.json` match only at the project root. Folder patterns like `scripts/**` match any file under that folder. Return array of `{ profile, pattern, matchedPath }`. Deduplicate.
- `suggestFolderPatterns(matches)` → group matches by parent directory. If 2+ files share a parent AND the parent is NOT the project root: suggest `<parent>/**`. If the parent IS the project root: do NOT suggest a pattern. List files individually. Return array of suggested patterns.

Does not write configs. Does not hash. Does not lock. Returns data.

### 5.11 Models

**ProjectConfig** (`project-config.model.mjs`):
Fields: `name` (string), `root` (string, absolute), `protected` (string[], deduplicated, no empty strings), `configPath` (string, absolute path to the JSON file itself).

**FileResult** (`file-result.model.mjs`):
Fields: `relativePath` (string), `status` (STATUS constant), `expectedHash` (string|null), `actualHash` (string|null), `modifiedAt` (Date|null).

```javascript
export const STATUS = {
  INTACT: 'INTACT',
  MODIFIED: 'MODIFIED',
  MISSING: 'MISSING',
  NOT_CAPTURED: 'NOT_CAPTURED',
  NOT_LOCKED: 'NOT_LOCKED',
};
```

**CheckResult** (`check-result.model.mjs`):
Fields: `projectName` (string), `configName` (string), `checkedAt` (Date), `files` (FileResult[]), `total` (number), `intact` (number), `violations` (number), `warnings` (number), `passed` (boolean).
Methods: `getViolations()` → files with status MODIFIED or MISSING. `getWarnings()` → files with status NOT_CAPTURED or NOT_LOCKED.

### 5.12 detection-profiles.mjs — Data

Exports two things. This is DATA, not logic. Adding a profile means adding a key. No code changes elsewhere.

```javascript
export const DETECTION_PROFILES = {
  'node-core': [
    'package.json', 'package-lock.json', 'npm-shrinkwrap.json',
    '.npmrc', '.nvmrc', '.node-version',
  ],
  'typescript': [
    'tsconfig*.json',
  ],
  'linters-formatters': [
    'eslint.config.*', '.eslintrc*', '.prettierrc*', 'prettier.config.*',
    '.editorconfig', '.ls-lint.yml', 'biome.json', 'biome.jsonc',
    '.stylelintrc*', 'stylelint.config.*',
  ],
  'bundlers-build': [
    'vite.config.*', 'webpack.config.*', 'rollup.config.*',
    'esbuild.config.*', 'parcel.config.*', 'wxt.config.*',
    'postcss.config.*', 'tailwind.config.*', 'babel.config.*', '.babelrc*',
  ],
  'testing': [
    'vitest.config.*', 'jest.config.*', '.mocharc*',
    'karma.conf.*', 'playwright.config.*', 'cypress.config.*',
  ],
  'ci-cd': [
    '.github/workflows/**', '.gitlab-ci.yml', 'Jenkinsfile',
    '.circleci/config.yml', '.travis.yml',
  ],
  'build-scripts': [
    'scripts/**',
  ],
  'governance-docs': [
    'governance.config.*', 'ARCHITECTURE.md',
  ],
  'python': [
    'pyproject.toml', 'setup.py', 'setup.cfg', 'requirements*.txt',
    'Pipfile', 'poetry.lock', '.flake8', '.pylintrc',
    'mypy.ini', 'ruff.toml', 'tox.ini', 'pytest.ini',
  ],
  'rust': [
    'Cargo.toml', 'Cargo.lock', 'rustfmt.toml', 'clippy.toml',
  ],
  'go': [
    'go.mod', 'go.sum', '.golangci.yml',
  ],
  'docker': [
    'Dockerfile*', 'docker-compose*.yml', 'docker-compose*.yaml', '.dockerignore',
  ],
  'version-control': [
    '.gitignore', '.gitattributes',
  ],
};

export const SKIP_DIRECTORIES = [
  'node_modules', '.git', 'dist', 'build', '.output', '.cache',
  'coverage', '__pycache__', '.venv', 'vendor', 'target', '.next', '.nuxt',
];
```

Note: `.github` is NOT in SKIP_DIRECTORIES. It must be traversed for the ci-cd profile. `.git` IS in the list and is skipped.

### 5.13 colors.util.mjs

Exports functions: `green(text)`, `red(text)`, `yellow(text)`, `bold(text)`, `dim(text)`. Each wraps text in ANSI escape codes and appends reset. Also exports constants: `CHECK = '✓'`, `CROSS = '✗'`, `WARN = '!'`.

### 5.14 paths.util.mjs

Exports:

**`ensureDirectories(toolRoot)`** → create `configs/`, `hashes/`, `reports/` under toolRoot if missing. `mkdirSync(recursive: true)`.

**`isAbsolutePath(p)`** → returns boolean. Checks `/` prefix or `^[A-Za-z]:[/\\]`.

**`sanitizeFilename(name)`** → replace `: * ? " < > | / \` and spaces with hyphens. Collapse multiple consecutive hyphens into one. Trim leading/trailing hyphens. Return sanitized string.

**`expandPatterns(root, patterns)`** → returns `{ paths: string[], warnings: string[] }`. This function does NOT print. Warnings are collected and returned. The caller prints them via Report.

For each pattern:
- No wildcards (`*` not present) → exact relative path. `path.join(root, pattern)`. If it resolves to a directory, skip it (only files). Add to paths.
- Ends with `/**` → extract directory prefix before `/**`. If directory does not exist: push warning `"Directory not found for pattern: <pattern>"`. If exists: recursive walk via `walkDir(dir, true, SKIP_DIRECTORIES)`. Add all file paths.
- Ends with `/*` → extract directory prefix before `/*`. If directory does not exist: push warning. If exists: walk depth 1 via `walkDir(dir, false, SKIP_DIRECTORIES)`. Add all file paths.
- Contains `*` in filename segment only (e.g., `*.config.*`, `tsconfig*.json`, `src/*.ts`) → extract directory prefix before the segment containing `*`. If no prefix, walk project root depth 1. If prefix exists, walk that directory depth 1. Match filename portion via `wildcardToRegex`. Add matches.
- Pattern contains `**` NOT at the end (e.g., `src/**/*.ts`) → throw `"Pattern not supported in v1: <pattern>. Use folder/** or folder/* instead."`
- After processing all patterns: if a pattern matched zero files and no warning was already pushed for it, push warning `"Pattern matched 0 files: <pattern>"`.
- Deduplicate paths. Filter out directories (only files). Return `{ paths, warnings }`.

**`wildcardToRegex(pattern)`** → convert `**` to `.*`, `*` to `[^/\\]*`, `.` to `\\.`. Handle both `/` and `\` separators via `[/\\\\]`. Anchor with `^` and `$`. Return RegExp.

**`walkDir(dir, recursive, skipDirs)`** → `readdirSync(dir, { withFileTypes: true })`. For each entry:
- If entry is a directory AND `skipDirs.includes(entry.name)`: skip. This is the ONLY skip rule. Do NOT apply a blanket rule against dot-directories. `.git` is in skipDirs and gets skipped. `.github` is NOT in skipDirs and must be traversed.
- If entry is a directory and recursive is true: descend. Track visited real paths via `fs.realpathSync` to prevent symlink loops. If `realpathSync` throws (broken symlink): skip the entry silently. Do not warn. If `readdirSync` throws on a subdirectory (permissions): skip that subdirectory silently.
- If entry is a file: add absolute path to results. Dotfiles (`.prettierrc`, `.editorconfig`) ARE included. They are files, not directories.
- Return array of absolute file paths.

## 6. CONFIG FORMAT

`configs/<name>.json`:

```json
{
  "name": "My Project",
  "root": "C:/absolute/path/to/project",
  "protected": [
    "package.json",
    "tsconfig.json",
    "eslint.config.ts",
    ".prettierrc",
    "scripts/**",
    "src/core/contracts/**",
    ".github/workflows/**"
  ]
}
```

| Field | Type | Required | Rule |
|---|---|---|---|
| `name` | string | yes | Human-readable. Used in report headers. |
| `root` | string | yes | Absolute path. Must exist. |
| `protected` | string[] | yes | Exact paths, `folder/*`, `folder/**`, or `*.ext` wildcards. Non-empty. Duplicates and empty strings are filtered by ConfigLoader. |

## 7. HASH STORE FORMAT

`hashes/<name>.hashes.json`:

```json
{
  "project": "My Project",
  "captured": "2026-08-02T14:32:01.000Z",
  "files": {
    "package.json": {
      "sha256": "a3f8c2...full-hash",
      "captured": "2026-08-02T14:32:01.000Z"
    },
    "scripts/gate-config.mjs": {
      "sha256": "b4e9d3...full-hash",
      "captured": "2026-08-02T14:32:01.000Z"
    }
  }
}
```

Keys are relative paths from `config.root`, using forward slashes. Never absolute paths. Values are hash + timestamp.

## 8. CONSOLE OUTPUT

### Init

```
╔══════════════════════════════════════════╗
║  CAGE GUARD — INIT                      ║
║  Scanning: C:/Users/You/dev/my-project  ║
╚══════════════════════════════════════════╝

  node-core:
    ✓ package.json
    ✓ package-lock.json

  typescript:
    ✓ tsconfig.json

  linters-formatters:
    ✓ eslint.config.ts
    ✓ .prettierrc
    ✓ .editorconfig

  bundlers-build:
    ✓ wxt.config.ts
    ✓ postcss.config.ts

  build-scripts:
    ✓ scripts/gate-config.mjs
    ✓ scripts/gate-scope.mjs
    ✓ scripts/generate-hashes.mjs

  ci-cd:
    ✓ .github/workflows/ci.yml

  Suggested folder patterns:
    scripts/**           (3 files → 1 pattern)
    .github/workflows/** (1 file → 1 pattern)

  14 files detected across 6 profiles.

  Protect these files? [Y/n/edit]
```

### Capture

```
╔══════════════════════════════════════════╗
║  CAGE GUARD — My Project                ║
║  CAPTURE — 2026-08-02 14:32:01          ║
╚══════════════════════════════════════════╝

  ✓ package.json              hashed + locked
  ✓ tsconfig.json             hashed + locked
  ✓ eslint.config.ts          hashed + locked
  ✓ scripts/gate-config.mjs   hashed + locked
  ...

  14/14 captured. Files are protected.
  Hash store: hashes/my-project.hashes.json
```

### Check — all clear

```
╔══════════════════════════════════════════╗
║  CAGE GUARD — My Project                ║
║  CHECK — 2026-08-02 15:45:12            ║
╚══════════════════════════════════════════╝

  ✓ package.json
  ✓ tsconfig.json
  ✓ eslint.config.ts
  ...

  14/14 intact. No violations.
```

### Check — violations

```
╔══════════════════════════════════════════╗
║  CAGE GUARD — My Project                ║
║  CHECK — 2026-08-02 15:45:12            ║
╚══════════════════════════════════════════╝

  ✗ eslint.config.ts              MODIFIED
  ✓ tsconfig.json
  ✗ scripts/gate-config.mjs      MISSING
  ! wxt.config.ts                 NOT LOCKED
  ! new-rule.ts                   NOT CAPTURED
  ...

  10/14 intact. 2 violations. 2 warnings.
```

### Check — multi-project

```
╔══════════════════════════════════════════╗
║  CAGE GUARD — ALL PROJECTS              ║
║  CHECK — 2026-08-02 15:45:12            ║
╚══════════════════════════════════════════╝

  ✓ project-alpha          14/14 intact
  ✗ project-beta           10/14 intact — 2 violations
  ✓ project-gamma          8/8 intact
  ✗ project-delta          ERROR: Project root not found: C:/old/path

  2/4 projects clean. 1 violation. 1 error.
```

## 9. AGENT-PASTE REPORT BLOCK

Printed after the summary when violations exist. Included in the report file.

```
=== CAGE GUARD REPORT ===
Project:   My Project
Config:    configs/my-project.json
Root:      C:/absolute/path/to/project
Checked:   2026-08-02 15:45:12
Status:    VIOLATION

MODIFIED FILES:
  eslint.config.ts
    expected: a3f8c2d1e9b4
    actual:   7d2e01f3a8c6
    modified: 2026-08-02 14:28:33

MISSING FILES:
  scripts/gate-config.mjs
    expected: b4e9d3a2f1c8

WARNINGS:
  wxt.config.ts — hash matches but file is not locked
  new-rule.ts — listed in config but never captured

ACTION REQUIRED:
  Protected files were modified or deleted.
  Revert ALL modifications to your last known good state.
  Do not continue building on a modified foundation.
  After reverting, re-run your project's validation process.
  If the modification was intentional and authorized by the
  project owner, re-run: node guard.mjs capture my-project

=== END REPORT ===
```

No git commands. No tool-specific instructions. Generic recovery message. Universal language — "modifications", not "uncommitted changes."

## 10. BAT WRAPPERS

### check-all.bat

```bat
@echo off
title Cage Guard — All Projects
node "%~dp0guard.mjs" check
echo.
pause
```

### protect-tool.bat

```bat
@echo off
title Cage Guard — Protect Tool Source
echo Protecting tool source files...
attrib +r "%~dp0guard.mjs"
attrib +r /s "%~dp0src\*"
attrib +r /s "%~dp0configs\*"
echo.
echo Tool source is now read-only.
echo NOTE: hashes/ and reports/ remain writable (required for operation).
echo.
pause
```

This protects the tool's code and configs but leaves `hashes/` and `reports/` writable. If the entire folder were set read-only, the tool could not write hash stores or reports.

Both .bat files must live in the `cage-guard/` folder. If the user wants a desktop shortcut, create a shortcut TO the .bat file. Do not copy the .bat file elsewhere — `%~dp0` resolves to the .bat's own directory.

## 11. README.md REQUIREMENTS

Must include these sections:

1. **What this is.** One paragraph. File integrity checker. Multi-project. Zero dependencies. Project-blind.
2. **Requirements.** Node.js 18+ in system PATH. Verify: `node --version`.
3. **Quick start.** Three commands: `init` → `capture` → `check`. With examples.
4. **Commands.** All three with usage and examples.
5. **Config format.** With example. Explain `protected` patterns: exact path, `folder/*`, `folder/**`, `*.ext`.
6. **Detection profiles.** List profile names. Note: profiles are data in `src/data/detection-profiles.mjs`. To add a profile, edit that file.
7. **Multi-project.** Place multiple JSON files in `configs/`. `check` with no name runs all.
8. **Double-click usage.** `check-all.bat` checks all projects. Create a desktop shortcut to it. Do not copy the .bat elsewhere.
9. **WARNING — agent workspace scope.** "This tool assumes your AI agent's workspace is restricted to the project folder. If your agent has broad file system access (PowerShell, CLI, bash), it can modify this tool's files. After setup, run protect-tool.bat. File attributes stop direct writes. They do not stop an agent with explicit shell access from running attrib or icacls. If your agent has unrestricted shell access, this tool is not sufficient protection."
10. **Git workflow note.** "Protected files are read-only. git pull, git checkout, git merge may fail if they touch protected files. Before git operations: temporarily remove read-only (`attrib -r <file>` on Windows, `chmod u+w <file>` on Unix). After: `node guard.mjs capture <name>`."
11. **Config editing note.** "Config file is set read-only after capture. To edit: remove read-only, edit, then `node guard.mjs capture <name>`."
12. **Tool self-protection note.** "Run protect-tool.bat after setup. This sets guard.mjs, src/, and configs/ to read-only. hashes/ and reports/ remain writable. Do NOT set the entire cage-guard folder read-only — the tool needs to write hash stores and reports."
13. **Troubleshooting.**
    - `"node is not recognized"` → Install Node.js 18+. Add to system PATH.
    - `"Config not found"` → Check the name matches the filename in configs/ (without .json).
    - `"Project root not found"` → The path in config.root does not exist. Edit the config.
    - `"EACCES on capture"` → Hash store is read-only. Capture handles this automatically. If it persists, manually remove read-only: `attrib -r hashes/<name>.hashes.json` (Windows) or `chmod u+w hashes/<name>.hashes.json` (Unix).
    - `"Cannot read <file>: locked by another process"` → Close the program using the file. Re-run check.
    - `"Pattern not supported in v1"` → `**` in the middle of a path is not supported. Use `folder/**` or `folder/*`.
    - `"Hash store corrupted"` → Delete `hashes/<name>.hashes.json`. Run capture to regenerate.
    - `"Invalid JSON in configs/"` → The config file has a syntax error. Open it and fix the JSON.
14. **Limitations.**
    - `**` in the middle of a path (`src/**/*.ts`) is not supported in v1. Use `src/**` or `src/*`.
    - File attributes stop direct writes, not shell commands (`attrib -r`, `icacls`).
    - Very large files are loaded entirely into memory for hashing.
    - Symlinks are followed to their target. Broken symlinks are skipped silently.

## 12. VALIDATION STEPS

Run ALL. Paste raw output. Do not summarize.

```
1.  Create the full folder structure as Section 3.
2.  Create test project: mkdir cage-guard/test-project.
    Create 3 dummy files inside it.
3.  Run: node guard.mjs init <absolute-path-to-test-project>
    → Scans. Prints detected files (or "0 detected" if dummies don't
      match profiles).
    → If 0 detected, manually create configs/test.project.json
      with the 3 files listed in protected.
4.  Run: node guard.mjs capture test.project
    → 3 hashed. 3 locked. Hash store created. Config locked. Exit 0.
5.  Run: node guard.mjs check test.project
    → 3 green INTACT. Exit 0.
6.  Unlock file 1 (chmod 0o666 or attrib -r). Modify file 1 content.
7.  Run: node guard.mjs check test.project
    → 1 red MODIFIED. 2 green. Exit 1. Agent-paste block printed.
8.  Delete file 2.
9.  Run: node guard.mjs check test.project
    → 1 MODIFIED. 1 MISSING. 1 green. Exit 1.
10. Unlock file 3 without modifying it.
11. Run: node guard.mjs check test.project
    → 1 yellow NOT_LOCKED. Exit 0 (warnings don't cause exit 1).
12. Add "new-file.ts" to config protected array. Do NOT run capture.
13. Run: node guard.mjs check test.project
    → 1 yellow NOT_CAPTURED for new-file.ts.
14. Run capture from a different working directory (e.g., C:\ or /tmp).
    → Paths resolve from config.root. Tool dirs resolve from
      import.meta.url. No crash.
15. Run capture a second time.
    → No crash on read-only hash store. Unlock/write/relock works.
16. Create second config: configs/test.two.json pointing to a second
    test folder with 2 files.
17. Run: node guard.mjs check
    → Multi-project summary. Both projects listed.
18. Run: node guard.mjs check nonexistent
    → "Config not found: configs/nonexistent.json". Exit 1. No stack trace.
19. Run: node guard.mjs (no arguments).
    → Lists configs. Prompts for selection. Runs check on selection.
20. Run: node guard.mjs badcommand
    → "Unknown command: badcommand. Available: init, capture, check."
      Exit 1. No stack trace.
21. Run: node guard.mjs capture (no name)
    → "Project name required." Exit 1. No stack trace.
22. Run: node guard.mjs init (no path)
    → "Project path required." Exit 1. No stack trace.
23. Test folder pattern: create config with protected: ["test-project/**"].
    Capture. Check. Modify one file. Check. → MODIFIED detected.
24. Test zero-match pattern: add "nonexistent-folder/**" to config.
    Check. → Yellow warning "Directory not found for pattern" or
    "Pattern matched 0 files". No crash.
25. Corrupt the hash store JSON manually (delete a bracket).
    Run check. → "Hash store corrupted". Exit 1. No stack trace.
26. Run init on the same project again.
    → "Config already exists. Overwrite? [Y/n]". Test both Y and n.
27. Verify report file exists in reports/ with format:
    test.project-YYYY-MM-DD-HHMM.log. No colons. No T.
28. Verify agent-paste block contains "Revert ALL modifications to your
    last known good state."
29. Verify agent-paste block contains project root path and config name.
30. Delete test-project, test folders, test configs, test hash stores,
    test reports after all validation passes.
```

## 13. CODE QUALITY CHECKLIST

Before delivering, verify every item:

**Architecture:**
- [ ] Every file has one class (except guard.mjs, detection-profiles.mjs, colors.util.mjs, paths.util.mjs).
- [ ] Every class has a JSDoc comment describing its single responsibility.
- [ ] Every public method has a JSDoc comment.
- [ ] No function exceeds 30 lines.
- [ ] No global variables. No module-level mutable state.
- [ ] All dependencies injected via constructor.
- [ ] Commands registered in a Map in guard.mjs.

**Output discipline:**
- [ ] No console.log anywhere. Report uses process.stdout.write. Errors use process.stderr.write.
- [ ] Utils NEVER print. expandPatterns returns { paths, warnings }. walkDir returns paths.
- [ ] CheckCommand prints warnings via Report.printWarning. No direct printing from utils.

**Path handling:**
- [ ] Tool dirs resolved from import.meta.url. Never from process.cwd().
- [ ] Project paths resolved from config.root. Never from process.cwd() at check/capture time.
- [ ] init resolves relative user input to absolute at input time only.
- [ ] Hash store keys are relative paths (from config.root), never absolute.
- [ ] Relative paths normalized to forward slashes.

**File operations:**
- [ ] Hashing uses Buffer (readFileSync with NO encoding parameter).
- [ ] fs.chmodSync for permissions. Never shell out to attrib or icacls.
- [ ] FileLock.lock and unlock return false on failure. Do not throw.
- [ ] FileLock.isLocked returns false for missing files. Does not throw.
- [ ] HashStore.save handles unlock/write/relock of hash store internally.
- [ ] expandPatterns deduplicates results and filters out directories.

**Directory walking:**
- [ ] walkDir skips ONLY directories in SKIP_DIRECTORIES. No blanket dot-directory rule.
- [ ] walkDir traverses .github/ (not in SKIP_DIRECTORIES).
- [ ] walkDir includes dotfiles (.prettierrc, .editorconfig).
- [ ] walkDir tracks visited real paths to prevent symlink loops.
- [ ] walkDir skips broken symlinks silently (realpathSync throws → skip).
- [ ] walkDir skips unreadable subdirectories silently.

**Scanner:**
- [ ] Scanner matches full relative path from project root, not filename alone.
- [ ] suggestFolderPatterns guards against suggesting /** for project root.

**Error handling:**
- [ ] Top-level try/catch in guard.mjs only. Plus: HashStore.save (unlock/write/relock), CheckCommand.executeAll (per-project), FileLock methods (return false), walkDir (per-directory).
- [ ] Missing config: clear error message. Exit 1. No stack trace.
- [ ] Invalid root: clear error message. Exit 1.
- [ ] Malformed config JSON: clear error message. Exit 1.
- [ ] Corrupted hash store JSON: clear error message. Exit 1.
- [ ] Missing arguments: clear usage message. Exit 1.
- [ ] executeAll results array handles both CheckResult and error objects.
- [ ] Report.printCombinedSummary handles both types without crashing.
- [ ] Report.writeReportFile catches write failures. Prints warning. Does not throw.

**Content:**
- [ ] Status values use STATUS constants. No string literals for statuses.
- [ ] Agent-paste report says "modifications", not "uncommitted changes".
- [ ] Agent-paste report includes project root path and config name.
- [ ] Report filename sanitized. Format: YYYY-MM-DD-HHMM. No colons. No T.
- [ ] readline interface closed after every use.
- [ ] protect-tool.bat does NOT set read-only on hashes/ or reports/.
- [ ] Tool runs from any working directory without errors.

---

**END OF INSTRUCTION. BUILD IT. PASTE RAW OUTPUT FOR EVERY VALIDATION STEP.**

---
 