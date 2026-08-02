# Cage Guard v1.0

## 1. What this is

Cage Guard is a standalone, multi-project file integrity checker. It reads one config per project, hashes the protected files, locks them read-only, and later verifies that their bytes have not changed. It is project-blind — it does not know what any file is or what any project does. It checks if bytes changed. That is all. Zero dependencies. Node.js built-ins only.

## 2. Requirements

- Node.js 18 or newer installed and available in your system PATH.
- Verify with: `node --version`

## 3. Getting Started

### Step 1 — Clone or copy the tool

```
git clone <repo-url> cage-guard
cd cage-guard
```

Or copy the folder anywhere. It has zero dependencies. No npm install.

### Step 2 — Verify Node.js

```
node --version
```

Must be 18 or newer. If "node is not recognized":
- Windows: install from nodejs.org, restart your terminal.
- Mac: `brew install node`
- Linux: `sudo apt install nodejs` (or your distro's package manager)

### Step 3 — Point the tool at your project

PowerShell:

```
node guard.mjs init "C:\Users\You\dev\my-project"
```

CMD:

```
node guard.mjs init "C:\Users\You\dev\my-project"
```

Git Bash / Mac / Linux:

```
node guard.mjs init /home/you/dev/my-project
```

Notes:
- Paths with spaces MUST be wrapped in quotes.
- PowerShell and CMD both accept forward slashes: `node guard.mjs init "C:/Users/You/dev/my-project"`
- The tool scans your project, detects known config files, and suggests a list. Press `Y` to accept, or type `edit` to customize.

### Step 4 — Capture (hash and lock)

```
node guard.mjs capture my-project
```

This hashes every protected file and sets it read-only. You will see green checkmarks. The hash store is written to `hashes/my-project.hashes.json`.

### Step 5 — Check (verify)

```
node guard.mjs check my-project
```

All green means your files are intact. Exit code 0. Red means something changed. Exit code 1.

### Step 6 — Protect the tool itself

Windows: double-click `protect-tool.bat`

Mac/Linux:

```
chmod -R a-w guard.mjs src/ configs/
```

This sets the tool's source code read-only. `hashes/` and `reports/` remain writable (the tool needs to write there).

### Step 7 — Create a desktop shortcut (optional)

Create a shortcut to `check-all.bat` on your desktop. Double-click it any time to check ALL projects at once. Do NOT copy the `.bat` file elsewhere — it only works from inside the cage-guard folder.

## 4. Commands

### init

```
node guard.mjs init <path>
```

Scans the project folder, detects known config files, suggests folder patterns, and writes a config. A relative path is resolved against your current directory; the resolved absolute path is stored in the config.

### capture

```
node guard.mjs capture <name>
```

Hashes and locks every file listed in `configs/<name>.json` and writes `hashes/<name>.hashes.json`.

### check

```
node guard.mjs check <name>
node guard.mjs check
```

The first verifies one project. The second (no name) checks every project in `configs/` and prints a combined summary.

### Daily workflow

Before reviewing any AI agent's work:

```
Double-click check-all.bat
(or: node guard.mjs check)
```

Green = safe to review. Red = stop. Paste the report block to your agent and say "revert."

When YOU need to edit protected files:

Windows (PowerShell or CMD):

```
attrib -r /s "C:\Users\You\dev\my-project\*"
(edit your files)
cd C:\path\to\cage-guard
node guard.mjs capture my-project
```

Mac / Linux:

```
chmod -R u+w /home/you/dev/my-project
(edit your files)
cd /path/to/cage-guard
node guard.mjs capture my-project
```

Capture re-hashes and re-locks everything. Run check to confirm green.

### Reading the output

| Symbol | Color | Meaning | Action |
|--------|-------|---------|--------|
| ✓ | Green | INTACT — unchanged and locked | None. All good. |
| ✗ | Red | MODIFIED — content changed | Revert or re-capture. |
| ✗ | Red | MISSING — file deleted | Restore or re-capture. |
| ! | Yellow | NOT LOCKED — hash matches but read-only removed | Run capture to re-lock. |
| ! | Yellow | NOT CAPTURED — in config but never hashed | Run capture. |

Yellow warnings do NOT cause exit code 1. Only red violations do.

If you see many yellow and zero red, you removed read-only to edit files but forgot to re-capture. Run capture.

When violations exist, the tool prints an agent-paste report block:

```
=== CAGE GUARD REPORT ===
Project:   My Project
...
ACTION REQUIRED:
  Revert ALL modifications to your last known good state.
=== END REPORT ===
```

Copy everything between the === lines. Paste it into your AI agent's conversation. The agent sees exactly what changed and what to do. You do not need to explain anything.

### Terminal reference

PowerShell:

```
cd "C:\Users\You\dev\cage-guard"
node guard.mjs check my-project
# Paths with spaces: always quote them.
# Forward slashes also work: "C:/Users/You/dev/my-project"
```

CMD:

```
cd "C:\Users\You\dev\cage-guard"
node guard.mjs check my-project
# Paths with spaces: always quote them.
```

Git Bash / Mac / Linux:

```
cd /home/you/dev/cage-guard
node guard.mjs check my-project
# Use forward slashes. Quote paths with spaces.
```

Unlock files:

```
Windows:  attrib -r /s "C:\path\to\project\*"
Unix:     chmod -R u+w /path/to/project
```

Re-lock files:

```
node guard.mjs capture my-project
```

## 5. Config format

Each project is one JSON file in `configs/`, e.g. `configs/my-project.json`:

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

| Field | Type | Rule |
|---|---|---|
| `name` | string | Human-readable name, used in report headers. |
| `root` | string | Absolute path. Must exist. |
| `protected` | string[] | Non-empty list of paths/patterns to protect. |

`protected` patterns:

- **Exact path** — e.g. `package.json`, `.prettierrc` — protects that single file.
- **`folder/*`** — protects files directly inside the folder (depth 1).
- **`folder/**`** — protects the folder recursively (any depth).
- **`*.ext`** — wildcard in a filename segment, e.g. `tsconfig*.json`, `vite.config.*`, `src/*.ts`.

## 6. Detection profiles

Profiles are data in `src/data/detection-profiles.mjs`. To add a profile, edit that file — no code changes elsewhere.

- node-core
- typescript
- linters-formatters
- bundlers-build
- testing
- ci-cd
- build-scripts
- governance-docs
- python
- rust
- go
- docker
- version-control

## 7. Multi-project

Place one JSON config per project in `configs/`. Running `node guard.mjs check` with no name checks every config and prints a combined summary. A failing project or a config error is reported per-project; the remaining projects still run.

## 8. Double-click usage

Run `check-all.bat` to check all projects. It calls `node guard.mjs check` and keeps the window open. Create a desktop shortcut to the `.bat` file. Do not copy the `.bat` elsewhere — `%~dp0` resolves to the batch file's own directory, so the batch file only works from inside the `cage-guard` folder.

## 9. WARNING — agent workspace scope

This tool assumes your AI agent's workspace is restricted to the project folder. If your agent has broad file system access (PowerShell, CLI, bash), it can modify this tool's files. After setup, run protect-tool.bat. File attributes stop direct writes. They do not stop an agent with explicit shell access from running attrib or icacls. If your agent has unrestricted shell access, this tool is not sufficient protection.

## 10. Git workflow note

Protected files are read-only. git pull, git checkout, git merge may fail if they touch protected files. Before git operations: temporarily remove read-only (`attrib -r <file>` on Windows, `chmod u+w <file>` on Unix). After: `node guard.mjs capture <name>`.

## 11. Config editing note

Config file is set read-only after capture. To edit: remove read-only, edit, then `node guard.mjs capture <name>`.

## 12. Tool self-protection note

Run protect-tool.bat after setup. This sets guard.mjs, src/, and configs/ to read-only. hashes/ and reports/ remain writable. Do NOT set the entire cage-guard folder read-only — the tool needs to write hash stores and reports.

## 13. Troubleshooting

| Error | Fix |
|---|---|
| `node is not recognized` | Install Node.js 18+. Add it to your system PATH. |
| `Config not found` | Check the name matches the filename in `configs/` (without `.json`). |
| `Project root not found` | The path in `config.root` does not exist. Edit the config. |
| `EACCES on capture` | Hash store is read-only. Capture handles this automatically. If it persists, manually remove read-only: `attrib -r hashes/<name>.hashes.json` (Windows) or `chmod u+w hashes/<name>.hashes.json` (Unix). |
| `Cannot read <file>: locked by another process` | Close the program using the file. Re-run check. |
| `Pattern not supported in v1` | `**` in the middle of a path is not supported. Use `folder/**` or `folder/*`. |
| `Hash store corrupted` | Delete `hashes/<name>.hashes.json`. Run capture to regenerate. |
| `Invalid JSON in configs/` | The config file has a syntax error. Open it and fix the JSON. |
| All files show NOT LOCKED | You removed read-only but didn't re-capture. Run: `node guard.mjs capture <name>` |
| `edit` mode isn't what I expected | `edit` accepts `remove <n>`, `add <pattern>`, then `done`. For a plain text edit, press `Y` and edit `configs/<name>.json` manually in your preferred editor. |

## 14. Limitations

- `**` in the middle of a path (`src/**/*.ts`) is not supported in v1. Use `src/**` or `src/*`.
- File attributes stop direct writes, not shell commands (`attrib -r`, `icacls`).
- Very large files are loaded entirely into memory for hashing.
- Symlinks are followed to their target. Broken symlinks are skipped silently.
