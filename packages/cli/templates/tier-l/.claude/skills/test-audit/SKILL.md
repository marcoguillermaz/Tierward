---
name: test-audit
description: Static test-suite quality audit - coverage from lcov/Istanbul/Cobertura/go/tarpaulin reports, pyramid shape (unit/integration/e2e ratio), anti-patterns (.only leaks, skipped tests, no-assertion tests, hardcoded sleeps). Stack-aware across 11 supported stacks.
user-invocable: true
model: sonnet
context: fork
background: false
argument-hint: [target:path:<dir>|target:file:<glob>|target:coverage:<path>|mode:all]
allowed-tools: Read Glob Grep Bash
---

## Scope for v1

- **Static analysis only.** Parses coverage reports produced by the project's test runner. Does not execute tests, does not re-run the suite, does not query CI history.
- **Flaky-test detection is deferred.** Detecting non-deterministic failures requires multiple runs or CI-history access, both out of scope for the first ship. Tracked as future-work item `TEST-flake-detection`.
- **Live flake / performance probes**: revisit after real usage.

---

## Configuration (adapt before first run)

> Replace these placeholders:
> - `[TEST_PATH]` - primary location of test files (e.g. `src/**/*.test.ts`, `tests/`, `spec/`, `Tests/`, `src/test/`)
> - `[COVERAGE_PATH]` - location of coverage reports if non-standard (e.g. `coverage/lcov.info`, `reports/coverage.xml`)
> - `[APP_SOURCE_PATH]` - path to application source (for colocated-test detection) - e.g. `src/`, `app/`, `lib/`

---

## Step 0 - Target resolution

Parse `$ARGUMENTS` for a `target:` or `mode:` token.

| Pattern | Meaning |
|---|---|
| `target:path:<dir>` | Audit tests under a specific directory only (e.g. `target:path:src/auth`) |
| `target:file:<glob>` | Audit files matching the glob (e.g. `target:file:**/*.integration.test.ts`) |
| `target:coverage:<path>` | Force a specific coverage report path instead of auto-detection |
| `mode:all` / no argument | **Full audit - every discovered test file and auto-detected coverage report.** |

**STRICT PARSING**: derive target ONLY from explicit text in `$ARGUMENTS`. Do NOT infer from conversation context, recent blocks, or memory.

Announce: `Running test-audit - scope: [FULL | target: <resolved>] - stack: <pending detection>`

---

## Step 1 - Stack detection

Detect the primary stack in this priority order. First matching marker wins.

| Stack | Marker file(s) |
|---|---|
| **node-ts** | `tsconfig.json` + `package.json` |
| **node-js** | `package.json` (no `tsconfig.json`) |
| **python** | `pyproject.toml` or `requirements.txt` or `setup.py` |
| **go** | `go.mod` |
| **rust** | `Cargo.toml` |
| **swift** | `Package.swift` or `*.xcodeproj` / `*.xcworkspace` |
| **kotlin** | `build.gradle.kts` or `build.gradle` with `kotlin(` plugin |
| **dotnet** | `*.csproj` or `*.sln` |
| **ruby** | `Gemfile` |
| **java** | `pom.xml` or `build.gradle` (no Kotlin plugin) |
| **generic** | None of the above |

If stack is **generic**: run T1-T8 with generic patterns only, skip framework-specific coverage parsing, announce `No known stack detected - running generic test-quality checks only.`

Update announcement: `Running test-audit - scope: [...] - stack: <detected>`

---

## Step 2 - Framework detection

Within the detected stack, identify the test framework. Parses `package.json` scripts, config files, and dependency declarations.

| Stack | Framework detection |
|---|---|
| **node-ts / node-js** | (a) `vitest` in `devDependencies` or `vitest.config.*` present -> **vitest** (b) `jest` in devDeps or `jest.config.*` -> **jest** (c) `mocha` in devDeps or `.mocharc*` -> **mocha** (d) `"test": "node --test"` in scripts -> **node:test** (e) none -> **unknown** |
| **python** | (a) `pytest` in `[tool.pytest.ini_options]` of `pyproject.toml` or `pytest.ini` -> **pytest** (b) `import unittest` in any test file -> **unittest** (c) none -> **unknown** |
| **go** | Always **testing** (stdlib). Presence of `testify` in `go.mod` noted. |
| **rust** | Always **cargo test**. Tarpaulin presence in dev-dependencies noted. |
| **swift** | (a) `import Testing` in any test file -> **swift-testing** (b) `import XCTest` -> **XCTest** (c) both -> **hybrid** |
| **kotlin** | (a) `kotest-` in dependencies -> **Kotest** (b) `junit` -> **JUnit** (c) none -> **unknown** |
| **dotnet** | (a) `xunit` NuGet package -> **xUnit** (b) `NUnit` -> **NUnit** (c) `MSTest.TestFramework` -> **MSTest** (d) none -> **unknown** |
| **ruby** | (a) `rspec` in `Gemfile` -> **RSpec** (b) `minitest` -> **Minitest** (c) none -> **unknown** |
| **java** | (a) `junit-jupiter` in `pom.xml` or `build.gradle` -> **JUnit 5** (b) `junit` 4.x -> **JUnit 4** (c) `testng` -> **TestNG** (d) none -> **unknown** |

Record: `Framework: <name>` - used to select the correct grep patterns in Step 6.

---

## Step 3 - Test file discovery

Glob by stack convention. Include both co-located and directory-based tests.

| Stack | Glob patterns |
|---|---|
| **node-ts / node-js** | `**/*.test.{ts,tsx,js,jsx,mjs}`, `**/*.spec.{ts,tsx,js,jsx,mjs}`, `**/__tests__/**/*.{ts,tsx,js,jsx,mjs}`, `tests/**/*.{ts,tsx,js,jsx,mjs}` |
| **python** | `test_*.py`, `*_test.py`, `tests/**/*.py` |
| **go** | `**/*_test.go` |
| **rust** | `tests/**/*.rs`, any `src/**/*.rs` with `#[cfg(test)]` module |
| **swift** | `Tests/**/*.swift`, `*Tests/**/*.swift` |
| **kotlin** | `src/test/**/*.kt`, `src/androidTest/**/*.kt` |
| **dotnet** | `**/*Tests*.cs`, `**/*Test.cs`, under any `*.Tests.csproj` |
| **ruby** | `spec/**/*_spec.rb`, `test/**/*_test.rb` |
| **java** | `src/test/**/*.java` |

Respect `target:path:` / `target:file:` if provided.

Announce: `Discovered N test files across K layers.`

If `N == 0`: output `No test files found. Skipping static checks. Coverage reports still parsed if available.` and continue to Step 4.

---

## Step 4 - Coverage report parsing (C1-C3)

Auto-detect coverage report formats. Honor `target:coverage:<path>` if provided.

### C1 - lcov.info (node, rust with tarpaulin --out Lcov)

Search paths: `coverage/lcov.info`, `coverage/lcov-report/`, `lcov.info`, `reports/lcov.info`.

Parse by scanning lines:
- `SF:<file>` starts a file block.
- `LF:<n>` = lines found, `LH:<n>` = lines hit. File coverage = `LH / LF * 100`.
- `BRF:<n>` = branches found, `BRH:<n>` = branches hit.
- `end_of_record` terminates the file block.

Report: total line %, total branch %, files < 50% (top 10 by SLOC), files at 0% (top 10).

### C2 - Istanbul JSON (node)

Search paths: `coverage/coverage-summary.json`, `coverage/coverage-final.json`.

Parse JSON. For `coverage-summary.json`: read the `total` key (`lines.pct`, `branches.pct`, `functions.pct`, `statements.pct`). For `coverage-final.json`: aggregate per-file `s` (statements) / `b` (branches) / `f` (functions).

Report: line %, branch %, function %, statement %.

### C3 - Cobertura XML (python, java, dotnet)

Search paths: `coverage.xml`, `cobertura.xml`, `coverage/cobertura-coverage.xml`, `build/reports/cobertura/coverage.xml`.

Parse XML: `<coverage line-rate="0.873" branch-rate="0.712">` at root. Per-package and per-class rates in child elements.

Report: line %, branch %, top uncovered classes.

### C3 (go) - `coverage.out`

Search paths: `coverage.out`, `cover.out`, `.coverage/coverage.out`.

Parse format: `mode: <mode>\n<file>:<start>,<end> <stmts> <count>`. Total % = `stmts_hit / stmts_total`. Use `Bash` with `go tool cover -func=<file>` if `go` is on PATH for a cleaner summary.

### C3 (rust) - tarpaulin JSON

Search paths: `tarpaulin-report.json`, `target/tarpaulin/report.json`.

Parse JSON: `files[].coverage` percentages, aggregate weighted by file SLOC.

### C3 (swift) - xcresult bundle *(optional)*

If `*.xcresult` directory exists AND `xcrun` is on PATH: run `xcrun xccov view --report --json <file>.xcresult` and parse JSON output. Skip gracefully if xcrun is unavailable (CI or Linux).

### Report format

```
## Coverage (source: <format>)
- Total lines: <X>%
- Branches: <Y>% (if available)
- Functions: <Z>% (if available)
- Files below 50%: <N>
- Files at 0%: <N>
```

### Severity mapping

- Total < 50% line coverage -> **High**
- Total < 80% line coverage -> **Medium**
- Any changed file in the current block at 0% coverage -> **Critical** (requires git diff cross-check; if git history unavailable, report as **High**)
- No coverage report detected -> nudge: `No coverage report detected. Pass target:coverage:<path> or run <test-command> with coverage flag to generate one.` - no severity, just a note.

---

## Step 5 - Pyramid shape (P1-P3)

Classify each test file discovered in Step 3:

| ID | Layer | Path / content heuristic |
|---|---|---|
| **P1** | Unit | Colocated `*.test.*` / `*.spec.*` next to source, or under `tests/unit/**`, `__tests__/**`, `test/unit/**`, `spec/unit/**`, `src/test/**/unit/**`. Default bucket if nothing else matches. |
| **P2** | Integration | Path contains `integration/`, or filename matches `*.integration.test.*` / `*.integration.spec.*` / `*_integration_test.*`. |
| **P3** | E2E | Path contains `e2e/`, `end-to-end/`, `uat/`, `system/`, or filename matches `*.e2e.*`. File imports `@playwright/test`, `cypress`, `detox`, `selenium`, `webdriverio`, `appium`, or (python) `playwright`, `splinter`. |

Compute `N_unit / N_integration / N_e2e` and their percentages of total.

**Verdicts** (target pyramid: ~70/20/10):

| Condition | Severity | Note |
|---|---|---|
| `N_e2e > 30%` | **Medium** | Inverted pyramid - E2E-heavy suite is slow and brittle |
| `N_integration > 50%` | **Medium** | Middle-heavy - consider splitting into unit vs E2E |
| `N_unit == 0 AND total > 0` | **High** | No unit tests - every change goes through slow layers |
| Only one layer present | **Medium** | Narrow coverage - regressions in untested layers will slip through |
| Within 50-85% unit / 10-35% integration / 2-20% E2E | **OK** | Report as balanced |

Report:

```
## Pyramid
- Unit: <N> (<P>%)
- Integration: <N> (<P>%)
- E2E: <N> (<P>%)
- Verdict: [balanced | inverted | middle-heavy | narrow | unit-absent]
```

---

## Step 6 - Static anti-pattern checks (T1-T8)

Run per stack. Read `${CLAUDE_SKILL_DIR}/PATTERNS.md` for stack-specific grep patterns for all checks below. Checks without a matching pattern produce `N/A - skipped for <stack>`, not false positives.

### T1 - `.only` / `fit` / `fdescribe` committed

**Critical.** Focused tests in committed code break CI: suite passes locally but skips everything except the focused case. Grep for focused-test markers using patterns from PATTERNS.md → T1.

Report each match with `FILE:LINE`. If ≥ 2 files have matches, escalate to T8.

### T2 - Skipped tests

**Medium** per match; **High** if skipped tests > 10% of suite. Grep for skip markers using patterns from PATTERNS.md → T2.

Report: count and top 10 with file:line.

### T3 - `.todo` placeholders

**Low.** Placeholder tests that never fail. Flag when count grows; not actionable per instance. See PATTERNS.md → T3.

Report: count only.

### T4 - Empty test bodies

**High.** Empty tests always pass and create false confidence. Grep for empty test body patterns from PATTERNS.md → T4 (multiline regex - use `multiline: true` where supported).

Report: each match with file:line.

### T5 - Tests without assertions

**High.** Test that runs code paths without verifying outcomes.

Heuristic: within a detected test body, grep for at least one of the stack's assertion patterns from PATTERNS.md → T5. Flag any test body that lacks all of its framework's patterns.

Report: each match with file:line. Expect some false positives (helper-only tests, integration setup) - mark findings as `probable` when the body is very short or wraps another function.

### T6 - Hardcoded sleeps in tests

**Medium.** Sleep-based waits are the primary source of flaky tests. Grep for sleep/delay patterns (numeric sleep ≥ 500ms) using PATTERNS.md → T6.

Report: each match with file:line and duration.

### T7 - Debug output left in tests

**Low.** Doesn't affect correctness but adds noise. Grep test files for debug output patterns from PATTERNS.md → T7.

Report: count only. Do not list individually unless count > 20.

### T8 - Multiple `.only` across files (broken CI)

**Critical.** Derived from T1: if ≥ 2 distinct files contain T1 matches, the CI gate is broken in a non-obvious way (each file contributes a focused case, so several cases run but most are skipped).

Report: one aggregate finding with the list of affected files.

---

## Step 7 - Report and backlog decision gate

Generate the report using the template in `${CLAUDE_SKILL_DIR}/REPORT.md`. Apply the severity guide and backlog writing rules from the same file.

---

## Execution notes

- Do NOT modify any test file. Audit only.
- Do NOT execute tests or the test runner. Coverage reports must already exist on disk.
- `target:coverage:<path>` bypasses auto-detection; accept absolute or project-relative path.
- If git history is available, cross-reference C Critical findings against `git diff HEAD~1` (files changed in the most recent commit) to distinguish "0% on pre-existing file" (High) from "0% on file changed in this block" (Critical). If git is not available, downgrade all 0% findings to High.
- This skill complements the Phase 3 test execution (which runs `[TEST_COMMAND]` but never inspects the suite itself). Run in Phase 5d Track C after Phase 3 passes.
- After the report, ask: "Do you want me to prepare the corrections for the identified findings?" Reply with `yes` only after the user has signed off on the specific findings.
