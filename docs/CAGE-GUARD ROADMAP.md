# CAGE-GUARD ROADMAP

Last updated: 2026-08-03
Status: v1.1 shipped. This file captures the direction and the plan.

## Why this tool exists

File Integrity Monitoring (FIM) tools exist for cybersecurity
(Tripwire, Wazuh, OSSEC). None are designed for AI-assisted
development workflows. This tool fills that gap. It is built
for developers who use AI agents to write code and need to
verify that the agent did not modify protected files before
reviewing the output.

The threat model is not adversarial. It is a well-meaning AI
agent taking the path of least resistance. The tool makes the
wrong path visible. Green means safe. Red means stop.

## Design principles (do not violate)

1. Project-blind. The tool never knows what a project is.
   It hashes bytes. It compares bytes. It reports bytes.
2. Zero dependencies. Node.js built-ins only. No npm install.
3. Human-operated. The human runs the tool. The agent never
   runs it. The agent never sees it.
4. The tool lives outside the project. Directory separation
   is the first security boundary.
5. Green means safe. Red means stop. No ambiguity.
6. The report is the interface. Copy. Paste. Done.
7. Accessibility is a feature, not a bullet. Status must be
   conveyed by symbol AND color, never color alone. The UI must
   be usable by dyslexic readers: large type, high contrast,
   generous spacing, OpenDyslexic.
8. The tool reports. It never remediates. It never auto-reverts
   or auto-corrects protected files. It only makes change visible.

## v1.0 — SHIPPED (2026-08-03)

- Multi-project file integrity checking
- Auto-detection of known config files (14 detection profiles)
- Folder pattern protection (exact, folder/*, folder/**, *.ext)
- Read-only locking via file attributes
- Agent-paste report block for AI agent conversations
- Zero dependencies. Node.js built-ins only.
- Double-click workflow (check-all.bat, protect-tool.bat)
- PowerShell, CMD, Git Bash, Mac/Linux support

## v1.1 — SHIPPED (2026-08-03)

Goal: make v1.0 a solid foundation and give future features a
stable contract. No new user-facing features beyond two small
commands. This is the "confirm v1.0 is solid" phase.

- [x] Test suite with `node:test` (built-in, zero-dep). Cover:
      paths.util (wildcardToRegex, expandPatterns, walkDir,
      symlink handling), scanner, hash-store, config-loader,
      file-lock, and a golden-file test for the agent-paste block.
- [x] Schema versioning. Add `version` to configs/*.json and
      hashes/*.hashes.json, with a migration path in
      ConfigLoader.load. Required before any schema-changing feature.
- [x] Stable, versioned `--json` output for check, capture, and
      status. This is the contract the dashboard and CI consume.
      Document exit codes (0/1) and the JSON shape.
- [x] `status <name>` command: lock state + last capture time,
      no re-hash. Quick "are my files locked right now?"
- [x] `unlock <name>` command: remove read-only so the human can
      edit. This is the daily friction point (README §10). Keep
      `capture` as the re-lock. This is NOT "unprotect".
- [x] `unprotect <name> <pattern>` command: remove a pattern from
      the protection list. Distinct from unlock.
- [x] Cleanup: guard.mjs dispatch. The commandMap is now the real
      dispatcher (polymorphic `execute(args)`); the if/else chain
      and dead Map are gone.
- [x] GATE double-click hub (added after ship, same release).
      `gate.bat` → `node guard.mjs menu`: interactive project
      picker with live lock counts, branching into Lock (capture),
      Unlock, Check, Status — all with confirm prompts. Replaces
      the proof-of-concept `open-gate.bat`. `protect-tool.bat`
      rewritten as a real command (`node guard.mjs protect-tool
      [lock|unlock]`) with verification output and a lock/unlock
      prompt; `check-all.bat` kept as a thin launcher. All three
      shortcuts are now thin launchers over testable commands.
      Daily flow needs no console typing and no remembering
      project names. 17 new tests (37 → 54).

## v1.2 — Snapshot + diff (the high-value feature)

Goal: show WHAT changed, not just THAT it changed. This is what
makes the tool genuinely useful and feeds the dashboard.

- [ ] Extend HashStore to persist content snapshots for text
      files (separate snapshots/ dir; schema v2 + migration).
- [ ] Zero-dependency line-diff module (Myers/LCS, ~100 lines).
- [ ] check computes diffs for MODIFIED files; the report block
      gains a DIFF section; --json includes it.
- [ ] Write a structured JSONL report alongside the text block
      (enables the history browser later).

## v2.0 — Accessibility-first web dashboard

Goal: a local UI for people who need it (dyslexia), without
breaking zero-dependency. NOT Tauri, NOT Electron, NOT a TUI.

- [ ] Local server via node:http bound to 127.0.0.1 only. Static
      HTML/CSS/JS in web/. One command: `node guard.mjs serve`.
- [ ] Renders from --json / reports: multi-project overview,
      per-project drill-down, file tree, diffs.
- [ ] Dyslexia styling as a first-class requirement: OpenDyslexic,
      high contrast, large type, generous spacing, symbols-not-color.
- [ ] Actions spawn the CLI (status/capture/check). The browser
      never reimplements hashing. The agent-paste block stays the
      primary artifact; the dashboard is a viewer over it.
- [ ] Security: bind 127.0.0.1; serve only tool-owned dirs
      (reports/, hashes/, configs/, web/); never serve arbitrary
      project paths; no file-read endpoint.
- [ ] Preserve protect-tool.bat self-protection. The dashboard
      must not weaken it.

## v2.1 — Local-only integration

- [ ] Detection profiles as JSON data files in profiles/
      (extensible data, not a plugin framework).
- [ ] Document git-based sharing of configs/ + profiles/
      (content hashes are portable; file attributes are re-applied
      by capture).
- [ ] Document CI usage: `node guard.mjs check` exits non-zero on
      violations, so it already works in CI. Flag this as a
      deliberate operator-model exception (CI runs it, not a human).
- [ ] Policy engine (per-file protection levels) ONLY if it earns
      its keep. It is a schema v2 change and adds real complexity.
      Defer until there is evidence of need.

## v2.5 — Reframed AI workflow items

- [ ] Manual attribution: human-run session-start / session-end
      wrapper scripts that record a note and run check. Not
      automatic, not agent-run.
- [ ] Git "which commit" via blame — NOT "which agent" (impossible:
      the tool is project-blind; git blame records the committer,
      not the agent).

## What is NOT planned

- Real-time file watching (fs.watch). Rejected in v1 design.
  Unreliable on Windows. Race conditions. The manual check model
  is correct.
- Process termination. The tool never kills an agent process.
- Cloud dependency. The tool runs locally. No server. No API.
- Enterprise FIM features. This is not Tripwire. This is a
  developer tool for AI-assisted workflows.
- Agent attribution. Impossible; the tool is project-blind.
- Agent-run hooks / auto-check on agent session end. Violates
  human-operated + agent-never-runs-it.
- Plugin framework / plugin API. Profiles are already data.
- Auto-remediation. The tool never auto-reverts or auto-corrects.
- Auth / RBAC / multi-user. Single-user local tool.
- Encryption of hashes/snapshots. Plaintext JSON is correct here.
- Mobile / remote access. The dashboard is localhost-only.
- TUI framework. Worse for the accessibility need; the dashboard
  supersedes it.

## Decision log

- 2026-08-03: Rejected Tauri/Electron for the UI. Both break
  zero-dependency. Chose node:http + static HTML dashboard.
- 2026-08-03: Rejected "agent session tracking" as stated. The
  tool cannot know which agent changed a file. Reframed as manual
  attribution + git blame for "which commit".
- 2026-08-03: Added tests + schema versioning as v1.1, before any
  feature work. A correctness tool needs correctness first.
- 2026-08-03: Shipped v1.1. 37 tests, schema v1 configs + hash
  stores, versioned --json contract, status/unlock/unprotect
  commands. Pre-ship audit caught two correctness bugs, both fixed:
  check-all --json now emits exactly one document, and unprotect
  cannot empty the protected list.
- 2026-08-03: Added the GATE hub to v1.1 after ship. The daily
  friction point was remembering project names and typing
  `node guard.mjs capture <name>` in a console. `open-gate.bat`
  (proof-of-concept) was replaced by `gate.bat` → `node guard.mjs
  menu`, an interactive picker with live lock counts and
  Lock/Unlock/Check/Status branches. `protect-tool.bat` became a
  real command with lock/unlock + verification. All shortcuts are
  now thin launchers over testable commands. 17 new tests (37→54).