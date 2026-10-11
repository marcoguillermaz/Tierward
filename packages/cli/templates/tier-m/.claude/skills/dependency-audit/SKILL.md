---
name: dependency-audit
description: Dependency update audit. Inventories outdated packages, classifies into Tier A (safe patch+minor), Tier B (non-core major), Tier C (core/breaking-risk). Fetches changelogs for breaking-change candidates, greps the codebase for consumed APIs to evaluate impact, checks the test baseline, and produces a decision report (apply/defer/escalate per package). Also checks runtime version vs current LTS. Stack-aware via sibling PATTERNS.md (node-ts, python, swift in v1; other stacks fall back to agnostic rules). Audit-only — never modifies package.json or lockfiles in v1.
user-invocable: true
model: sonnet
context: fork
argument-hint: [tier:A|tier:B|tier:C|pkg:<name>]
allowed-tools: Bash WebFetch Read Glob Grep mcp__package-registry-mcp__lookup_package mcp__package-registry-mcp__search_package
---

You are performing a dependency update audit on the current project. The skill is **read-only by default**: it produces a decision report; it never modifies `package.json`, lockfiles, or any source.

## Step 0 — Stack detection + scope resolution

Detect the project stack from the manifest file present at the project root:

| Manifest | Stack | Inventory command |
|---|---|---|
| `package.json` | node-ts / node-js | `npm outdated --json` (or `pnpm outdated --format json` if `pnpm-lock.yaml` exists) |
| `pyproject.toml` or `requirements.txt` | python | `pip list --outdated --format=json` (or `uv pip list --outdated --format json` if `uv.lock` exists) |
| `Package.swift` | swift | `swift package show-dependencies --format json` + manual upstream check |
| `Cargo.toml` | rust | `cargo outdated --format json` (requires `cargo-outdated`; fall back to `cargo update --dry-run` if absent) |
| `go.mod` | go | `go list -u -m -json all` |
| `Gemfile` | ruby | `bundle outdated --parseable` |
| `pom.xml` or `build.gradle*` | java / kotlin | Maven `versions:display-dependency-updates` or Gradle `dependencyUpdates` |
| `*.csproj` | dotnet | `dotnet list package --outdated --format json` |

If the manifest is absent or unrecognized, STOP and report `not applicable: stack not detected`.

If a sibling `PATTERNS.md` exists for the detected stack, load it for tier classification. Otherwise apply only the agnostic Tier rules in this body.

Parse `$ARGUMENTS` for `tier:` and `pkg:` filters.

| Filter | Behavior |
|---|---|
| `tier:A` / `tier:B` / `tier:C` | Restrict the report to one tier. |
| `pkg:<name>` | Drill into a single package: full changelog fetch + grep of API surface in the codebase. |
| (no filter) | Full report across all tiers. |

## Tier definitions (agnostic)

**Tier A — Safe** (patch + minor on non-breaking lib):
- Patch versions on any package.
- Minor versions on packages whose changelog explicitly declares no breaking changes AND no API consumed by the project is removed.
- Failure mode: nearly never breaks; recoverable in seconds.
- Action: batch in a single PR.

**Tier B — Non-core major / minor with friction**:
- Major versions on lint, test, build, and devDeps tooling (eslint, prettier, vitest, jest, playwright, etc.).
- Minor versions on dependencies that the changelog flags as having subtle behaviour changes.
- Failure mode: build/test red, NOT runtime regression in production.
- Action: one PR per package; CI must be green before merge.

**Tier C — Core** (touches build / API contract / runtime):
- Major versions on the framework, language runtime, ORM, auth library, payment library, or any dependency that participates in the request path.
- Any version bump on libraries handling money, PII, or external integrations.
- Failure mode: silent runtime regression or wide-spread refactor.
- Action: full pipeline block (worktree + scope gate + e2e + post-merge audit). Never Fast Lane.

PATTERNS.md (when present) maps known package names of the detected stack to one of the three tiers and adds stack-specific exceptions. The body rules above are the fallback.

## Step 1 — Inventory

Run the stack-appropriate inventory command from Step 0. Cache the JSON to a temp file to avoid duplicate runs. Temp files go in `.tierward/tmp/` at the project root (gitignored), never in the shared `/tmp`, where a fixed name is readable by other users and shared across projects, and not under `.claude/`, a protected path where Claude Code asks before every write:

```bash
# Example for node-ts:
mkdir -p .tierward/tmp
npm outdated --json > .tierward/tmp/dependency-audit-outdated.json 2>/dev/null
```

Parse to a normalized list. Each entry: `name`, `current`, `wanted`, `latest`, `type` (prod/dev), `severity` (patch / minor / major — compute from current vs latest using semver).

If the inventory is empty, report `All dependencies on latest` and skip to Step 5.

## Step 2 — Risk classification

For each package:

1. Compute severity (patch / minor / major).
2. Apply tier rules: PATTERNS.md first if present, otherwise the agnostic rules above.
3. For Tier B/C only, fetch the changelog. Two paths, MCP-aware preferred (v1.20+):

   **Path A — MCP-aware (preferred when `package-registry-mcp` is wired)**
   Pinned MCP server: [`package-registry-mcp`](https://github.com/Artmann/package-registry-mcp). Multi-ecosystem (npm / PyPI / Cargo / NuGet), no auth.
   - Call `mcp__package-registry-mcp__lookup_package` with the package name + ecosystem to get current metadata: latest version, repository URL, maintainer, dist-tags.
   - Use the returned repository URL to fetch the GitHub releases (`gh api repos/<owner>/<repo>/releases/latest --jq '.body'`).
   - This path is more reliable than guessing the repo URL from the package homepage and avoids stale npm-registry HTML scraping.

   **Path B — Fallback (when MCP unreachable)**
   Print explicitly: `"⚠ package-registry-mcp unavailable, falling back to WebFetch (registry HTML may be stale or rate-limited)."`
   - GitHub releases first if the source is known (`gh api repos/<owner>/<repo>/releases/latest --jq '.body' 2>/dev/null`).
   - Fallback: `WebFetch` against the package homepage / npm-registry / PyPI / crates.io page.

   Cache changelog text in `.tierward/tmp/dependency-audit-changelog-<pkg>.txt` regardless of path.
4. From each Tier B/C changelog, extract: top 3 breaking changes, deprecated APIs, minimum runtime requirements.

## Step 3 — Decision matrix

For every Tier B/C package, run a targeted grep of the codebase against breaking-API names extracted from the changelog:

```bash
# Generic pattern; refine to the stack's source extensions
grep -rEn "<api-pattern>" <project source paths> --include="<stack file glob>" | head -10
```

Source paths and globs vary by stack — PATTERNS.md provides the conventional set per stack. Agnostic fallback: search the whole repo excluding `node_modules`, `vendor`, `target`, `build`, `dist`.

Record per package: number of import sites, number of breaking-API consumption sites, file paths affected.

**Decision rule** (generic):
- 0 breaking-API hits + Tier B → recommend `apply`.
- 1–5 hits + Tier B → recommend `apply with refactor` (if ≤ 3 files touched).
- 6+ hits OR Tier C → recommend `escalate` (full pipeline block).
- Hits in money paths / auth / PII handling / external integrations → always `escalate`, regardless of count.
- Pre-1.0 library (`0.x.y`) on Tier C: always `escalate` even on a minor bump.

**Optional defer slot**: if the upstream release is < 30 days old AND no security CVE is open, recommend `defer 30d` for Tier C. Avoids being the first project to hit a regression.

## Step 4 — Coverage check

Before any `apply` recommendation, verify the test baseline:

```bash
# The exact commands depend on the stack. Examples:
# node-ts:   npx tsc --noEmit && npx vitest run
# python:    mypy . && pytest
# swift:     swift build && swift test
```

If type check or test runner is currently red on the main branch: STOP recommending applies. The recommendation becomes `block: fix red baseline first`. A dependency update on a red tree masks the real culprit.

For each `apply` recommendation, list the test files most likely to catch regression for that package. PATTERNS.md provides the per-stack mapping (e.g., for node-ts web stacks: e2e specs cover the framework; integration tests cover the ORM; visual baseline covers UI libs).

If a Tier B/C package has < 3 test files covering its surface, flag in the report as `low coverage — manual smoke required`.

## Step 5 — Runtime version check

Compare the local runtime against the current LTS (or the stack's equivalent stable channel):

```bash
# node:    node --version  · grep '"engines"' package.json
# python:  python --version · grep python_requires pyproject.toml
# swift:   swift --version
# go:      go version · grep '^go ' go.mod
# rust:    rustc --version
```

Fetch the current stable / LTS via WebFetch from the official channel:

- node:   https://nodejs.org/en/about/previous-releases
- python: https://devguide.python.org/versions/
- swift:  https://www.swift.org/install/
- go:     https://go.dev/doc/devel/release
- rust:   https://www.rust-lang.org/learn/get-started

**Decision rule** (universal):
- Local ≥ current stable / Active LTS → PASS.
- Local = previous LTS still supported → WARN, plan the bump within 6 months.
- Local = LTS in maintenance / security-only → FAIL, bump within 30 days.
- Local = EOL → CRITICAL, bump in the next block.

Recommend pinning the runtime in the appropriate file (`.nvmrc`, `.python-version`, `rust-toolchain.toml`, `go.mod` `go ` directive, etc.) if absent.

## Step 6 — Report

Produce a single Markdown report on stdout. Format:

```markdown
# Dependency Audit — <YYYY-MM-DD>

## Summary
- Stack detected: <stack>
- Total outdated: N (P patch, M minor, J major)
- Tier A (safe): N packages → batch apply
- Tier B (non-core major): N packages → K apply, K-N defer
- Tier C (core): N packages → K apply, K-N defer, K-N escalate
- Runtime: <name> v<X.Y.Z> (status: PASS | WARN | FAIL | CRITICAL)
- Test baseline: <type-check status> · <test-runner status>

## Tier A — Apply batch
| Package | Current | Latest | Notes |
|---|---|---|---|

PR title proposal: `chore(deps): tier-a batch update <YYYY-MM-DD>`

## Tier B — Per-package decisions
### <package> <current> → <latest>
- Severity: major | minor
- Breaking changes: …
- Codebase impact: N import sites, K breaking-API hits in <files>
- Test coverage: …
- Recommendation: apply | apply with refactor | defer 30d | escalate

(repeat per package)

## Tier C — Core packages
(same per-package format, more conservative recommendations)

## Runtime
- Local: <name> v<X.Y.Z>
- Reference: <stable / Active LTS> v<X>
- Status: PASS | WARN | FAIL | CRITICAL
- Recommendation: …

## Backlog deltas (defer / escalate items)
List of items to add to the project's refactoring or upgrade backlog:
- DEPS-<pkg>: <recommendation> (<reason>)
```

## Hard rules

- Never run `npm install`, `pip install`, `swift package update`, `go get -u`, or any other resolver that mutates dependency state. The skill is audit-only in v1.
- Never modify `package.json`, `pyproject.toml`, `Package.swift`, `Cargo.toml`, `go.mod`, or any lockfile.
- Never re-classify a package across tiers silently. If the PATTERNS.md classification feels wrong for the project, flag it in the report; do not silently change tiers.
- Always cache changelogs under `.tierward/tmp/dependency-audit-changelog-*` to avoid hammering upstream registries mid-run.
- Run the test baseline against the main branch state, not a worktree with WIP, since WIP may mask the baseline.

## Out of scope (v1)

- Apply mode (`mode:apply-tier-a`). Scheduled for v2 (see roadmap-status).
- License compliance. Lives in `/security-audit` already.
- Full SCA (transitive vulnerability surface). Lives in `/security-audit` (`security-audit` already covers CVE scan).
- Generated lockfile auditing across CI environments. Stack-specific, deferred.

## Stack adaptation

PATTERNS.md (sibling file) provides per-stack classification rules and source-path patterns for the top 3 stacks in v1: node-ts, python, swift. Other stacks (node-js, go, ruby, rust, kotlin, java, dotnet) fall back to the agnostic rules in this body. PATTERNS.md is loaded conditionally only when the detected stack matches one of the documented entries.
