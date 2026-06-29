# Changelog

All notable changes to tierward (formerly claude-dev-kit) are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [1.34.0] — 2026-06-29

### Added

- **Branded wizard onboarding.** `npx tierward init` opens with a Tierward masthead and a one-line value statement. The post-scaffold output closes with a tier-aware summary of what you got and a concrete "Try it now" first action.
- **Human-approval commit gate** (Tier M/L): a hook blocks `git commit` until you approve the block's requirements at the Phase 1 STOP gate. Governance enforced from your approval, not asserted by Claude.
- **Go support** across the audit skills (security, performance, migration, dependency, doc, API-contract, infrastructure, pr-review, database).

### Changed

- **Positioning, on every surface** (README, npm page, docs site). Tierward now leads with the governed, phased process and the human-approval commit gate; the test gate is presented as verification rather than the headline. Hook: "Claude generates. You or your team decides."
- **Greenfield 0-to-1 activation.** The tier-upgrade command works (`init --tier=s|m|l`), the test gate no longer deadlocks on an empty project, and discovery turns an idea into a plan.
- **Tier 0 guidance.** A lightweight, proactive guide for the Discovery tier. The arch-audit reminder no longer nags brand-new projects; it waits until at least one block has completed.

### Fixed

- vite bumped 5 to 6.4.3, resolving the open Dependabot CVEs.

---

## [1.33.4] — 2026-06-24

### Fixed

- **`npx tierward init` now works** — inquirer v14 (Dependabot float `^8→^14`) dropped the `list` prompt type, renamed to `select`. All 31 uses of `type:'list'` across 9 files were broken for every user running the interactive wizard. The integration tests use `--answers` (bypasses inquirer), so no test caught it across the version float.

### Added

- **Prompt-type registration guard** (`test/unit/prompt-types.test.js`) — greps source for all `type:'x'` prompt strings and asserts each is registered in the installed inquirer. Runs in required CI unit checks; catches this class of breakage at commit time without a TTY.

---

## [1.33.3] — 2026-06-23

### Fixed

- **MCP server now starts when launched via a symlink** (`npx`, Claude Desktop). The `isMain` guard compared `import.meta.url` against `file://${process.argv[1]}`; with a symlinked `tierward-mcp` bin (or macOS `/var`→`/private/var`) the two differed, so the server never started and the process exited immediately. The published 1.33.2 server was non-functional on the primary install path; integration tests missed it because they launch the real source path. Now resolves real paths on both sides, with a symlink-launch regression guard in the integration suite.

---

## [1.33.2] — 2026-06-23

### Added

- **`mcpName` in `package.json`** (`io.github.marcoguillermaz/tierward`) for Model Context Protocol registry ownership verification, plus a `server.json` manifest at the repo root. Enables submitting the bundled `tierward-mcp` server to the official MCP registry. No runtime change.

---

## [1.33.1] — 2026-06-19

### Added

- **Language rule in `output-style.md` (all tiers).** Claude must never translate code identifiers, file paths, commands, field names, env vars, or other system values; they stay verbatim regardless of the response language. Shipped to every tier through the existing rule import. (#237, #238)

### Fixed

- **`doctor` now validates `output-style.md` on tier 0.** The `output-style-rule` check gated on `pipeline.md`, which tier 0 does not ship, so tier 0's only rule file was scaffolded but never checked. The gate is now `.claude/settings.json` (the scaffold signal), so the check covers every tier; the M/L-only standards checks still gate on `pipeline.md`. (#237, #238)

---

## [1.33.0] — 2026-06-19

### Added

- **`systematic-debugging` process skill (tier S, M, L).** New skill enforcing root-cause investigation before any fix. Tier S is a compact 3-phase version (Reproduce → Hypothesize → Fix). Tier M/L adds a Pattern Analysis phase and a Common Rationalizations table. All three tiers include an explicit STOP gate between hypothesis and implementation: the hypothesis must be written and verified against evidence before touching any code. Pipeline hooks in FL-1 (tier S) and Phase 2 (tier M/L) route bug encounters to the skill automatically. Adapted from the superpowers reference implementation; stack-agnostic — repro case can be a failing test, a script, or a manual recipe. (#229)

### Changed

- **Skill methodology — Red Flags anti-rationalization.** Six discipline-enforcing skills (`skill-review`, `commit`, `simplify`, `skill-security`, and the new `systematic-debugging`) now carry a Red Flags table pairing each common rationalization with the concrete failure mode it produces. Covers the most frequent ways practitioners justify skipping a skill's core discipline under time pressure. (#228)
- **`skill-review` pipeline v2 — eval before/after delta.** When `2.E` behavioral fixtures run before a fix session, the pipeline now records a before-state pass-rate (`2.E before: N/N pass`), re-runs after Phase 3, and reports the delta in Phase 6 (`2.E eval delta: before → after`). Skip is explicit when no fix session follows. Applies to both tier M (lite mode) and tier L (full mode). (#228)

---

## [1.32.1] — 2026-06-18

### Fixed

- **Plugin skill companion files.** Seven companion files (`REPORT.md`, `PATTERNS.md`, `BATCH_COMMANDS.md`, `advanced-checks.md`) were missing from the plugin skills directories, causing `/tierward:arch-audit`, `/tierward:security-audit`, `/tierward:perf-audit`, and `/tierward:skill-dev` to reference files that did not exist in standalone (non-CDK) projects. All four skills now work correctly. (#222)
- **`/tierward:arch-audit` non-invasive guard.** The Step 5 timestamp write is now conditional on the `.claude/session/` directory already existing, keeping the plugin non-invasive in projects that have not run `npx tierward init`. (#222)

---

## [1.32.0] — 2026-06-18

### Added

- **Tierward plugin for Claude Code marketplace.** Tierward now ships as a Claude Code plugin alongside the npm CLI. `claude plugin marketplace add marcoguillermaz/tierward` installs eight governance skills namespaced as `/tierward:commit`, `/tierward:arch-audit`, `/tierward:security-audit`, `/tierward:perf-audit`, `/tierward:simplify`, `/tierward:skill-dev`, `/tierward:skill-security`, and `/tierward:humanize`. No `npx tierward init` required. (#218, #219)
- **Bootstrap soft hook.** A `UserPromptSubmit` hook adds a one-line reminder of available `/tierward:*` skills to each session's system context — never prompts, never auto-executes. (#218)
- **Private marketplace registry.** A `marketplace.json` at the repository root enables plugin installation through the standard Claude Code marketplace API. (#218)

---

## [1.31.0] — 2026-06-18

### Added

- **VS Code extension — skill invocation bridge (P4).** CodeLens buttons appear directly on `SKILL.md` files to run any user-invocable skill in Claude Code with one click. The Command Palette gains a `Tierward: Run Skill` picker that filters to invocable skills and opens Claude Code via the official URI handler (`vscode://anthropic.claude-code/open`). The Governance tree view now shows a `Run in Claude Code` inline action on invocable skills only, keeping non-invocable entries clean. (#206)
- **VS Code extension — CI packaging workflows (P5).** Two new GitHub Actions workflows: `vscode-extension.yml` runs typecheck and packaging on every push/PR touching the extension; `vscode-publish.yml` triggers on `vscode-v*` tags and publishes to the Marketplace when `VSCE_PAT` is configured. (#207)
- **VS Code extension published to Marketplace.** `tierward-vscode@0.0.1` is live under publisher `MarcoGuillermaz`. Install with: `ext install MarcoGuillermaz.tierward-vscode`.

### Changed

- **Renamed `claude-dev-kit` → `tierward`.** The npm package, CLI binary, and MCP server now ship as `tierward` (and `tierward-mcp`). The `claude-dev-kit` and `claude-dev-kit-mcp` binaries remain as aliases through the deprecation window. The `mg-claude-dev-kit` npm package is deprecated in favour of `tierward`. Existing clones redirect automatically via GitHub's repository redirect. MCP tool names (`cdk_*`), the `"cdk"` config key, and env vars (`CDK_PROJECT_ROOT`, `CDK_CONTEXT_LLM_MODEL`) are unchanged; they are API contracts. (#208, #210)

### Fixed

- VS Code extension package metadata aligned to Tierward naming: `displayName`, command titles, activity bar title, configuration section, `cdk.cliPath` default updated to `tierward`. (#210)

---

## [1.30.0] — 2026-06-16

### Added

- **VS Code extension — governance tree view (P1).** A CDK sidebar panel lists all installed skills (with tier badges) and all active governance rules from `.claude/rules/`. Clicking any entry opens the file directly in the editor. Requires the `claude-dev-kit-mcp` server running alongside the extension. (#196)
- **VS Code extension — health monitoring and status bar (P2).** A status-bar item shows live CDK health: the `doctor` check result and the staleness of the last `arch-audit` run. The item turns amber when the audit is more than 7 days old and red when doctor reports errors. Clicking opens the CDK output channel with the full diagnostic output. (#201)
- **VS Code extension — diagnostics in Problems panel (P3).** CDK doctor findings are now surfaced as VS Code diagnostics (errors and warnings) in the Problems panel, with file-level attribution. Findings with a resolvable file path open the relevant file on click. Refreshes automatically when the extension detects a doctor re-run. (#203)
- **`/skill-security` — SkillSpector integration (tier S, M, L).** New audit skill that scans Claude Code skill files for 64 vulnerability patterns: prompt injection, data exfiltration, MCP tool poisoning, supply-chain attacks, and taint tracking across tool call chains. Scaffolded at tier S and above; listed in the cheatsheet for all tiers. (#202)

### Changed

- **Cross-LLM rubric jury re-baselined to Opus 4.8.** The Opus seat in `scripts/cross-llm-rubric.mjs` moved from `claude-opus-4-7` to `claude-opus-4-8`. This is a deliberate re-baseline: scores produced from 2026-06-10 onward are **not** directly comparable to the v1.0 CONTEXT.md pilot results scored under the 4.7 jury.
- **`scripts/external-review.mjs` default Opus model** bumped from `claude-opus-4-7` to `claude-opus-4-8` (maintainer-only tool; not shipped in the scaffold payload).
- **Staging workflow.** `staging` is now the default branch and permanent integration base. All feature work branches off `staging` via a local `new-worktree.sh` helper (gitignored). `main` is squash-only, promoted from `staging` at release time.

### Docs

- **`docs/operational-guide.md`** version header and footer synced to `1.30.0`.
- **`docs/reviews/anthropic-spec-deviations.md`** last-reviewed date refreshed to 2026-06-10; current model tier (`claude-opus-4-8`, `claude-fable-5` GA) recorded.
- **`README.md`** version stamps updated to `v1.30.0`.

---

## [1.29.2] — 2026-05-20

### Fixed

- **`anthropicCall` in cross-LLM scripts** no longer sends `temperature`. The first live smoke test of `scripts/cross-llm-rubric.mjs` against an Anthropic key surfaced a 400 from Opus 4.7: `temperature is deprecated for this model`. Sonnet was unaffected but the locked jury requires all three providers to respond. Removed `temperature: 0.2` from `anthropicCall` in both `scripts/cross-llm-rubric.mjs` and `scripts/external-review.mjs`; the API default is fine for review-style judgment tasks. Smoke test path now reaches the parsing stage on Opus too.

### Notes

- Discovered during the live smoke of the rubric after v1.29.0 / v1.29.1 shipped (unit tests mock the provider call and so couldn't catch a real-world API change).
- npm publish still pending, tracked separately in #181 (OIDC trusted-publisher registration required on npmjs.com).

---

## [1.29.1] — 2026-05-20

### Fixed

- **npm publish workflow.** v1.29.0 release tag failed to publish because the workflow at `.github/workflows/npm-publish.yml` runs `npm ci`, which needs a lockfile, but `packages/cli/package-lock.json` was gitignored. Removed the entry from `.gitignore` and committed a fresh lockfile generated by `npm install --package-lock-only`. v1.29.0 stays as a GitHub tag/release; the npm package skips straight to v1.29.1 with no functional changes.

### Notes

- The fresh lockfile carried 5 advisories (4 moderate, 1 high: `fast-uri`, `hono`, `ip-address`, `express-rate-limit`) flagged by GitHub dependency-review. `npm audit fix` resolved all of them by bumping the affected transitive deps. Final state: 0 vulnerabilities.

---

## [1.29.0] — 2026-05-20

### Added

- **Cross-LLM rubric automation for Context Builder** (closes v1.1 P5 from the reopened roadmap). The SHOULD PASS scoring on `CONTEXT.md` (locked 2026-05-07, run manually during the v1.0 pilot on 2026-05-11) now runs as a single command. Maintainer-side gate, not an end-user feature.
  - `scripts/cross-llm-rubric.mjs` — fans out to the locked jury (`claude-opus-4-7` + `claude-sonnet-4-6` + `gemini-2.5-pro`), parses each response as JSON, aggregates per-criterion medians, applies the threshold (all medians ≥ 2 AND ≥ 80 % of criteria with median ≥ 2), writes `report.json` + `report.md` + raw responses.
  - **Hard-fail policy.** Missing `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` → exit 2 (config error, no models called). Any provider runtime error (network, 5xx, abort) → exit 1. Malformed JSON from one model does not abort the run: that model's missing criteria score 0 and the report flags `malformed: true`.
  - **Provider extension.** `scripts/external-review.mjs` gains two Anthropic entries (`anthropic-opus` and `anthropic-sonnet`) so the locked jury can be invoked from there as well.
  - **Calibration note.** The criteria were locked against schema v1 when only tier 0 / S were supported. v1.27.0 (2026-05-14) added tier M / L; A6 ("tier plausible") may discriminate less on M / L outputs and Q2 / Q3 do not yet reward acknowledgment of M / L feature flags. Re-calibrate the prompt template if M / L outputs become a routine target.

### Changed

- `packages/cli/test/cross-llm-rubric/prompt-template.md` — introduces a `{CRITERIA_LIST}` placeholder. The applicable criteria are now selected in code from `frontmatter.project.mode` (3 for greenfield, 12 for in-place / from-context) and injected into the prompt as an explicit list, rather than relying on the model to honor a "skip for greenfield" instruction.
- `packages/cli/test/cross-llm-rubric/README.md` — rewritten for the automated flow; the manual pilot procedure is kept as a historical appendix.
- `docs/operational-guide.md` — adds section 15d covering the rubric script, next to the existing template-coverage gates (15c).
- `docs/reviews/context-builder-pilot-v1.md` — the automated script now resolves the pre-ship checklist item on locked-jury re-run.

### Notes

- 585/585 unit tests pass (+31 new tests for parsing, aggregation, threshold, and markdown rendering, all with mocked providers; no live LLM calls).
- Maintainer-only surface: no new public CLI command, no new dependency in the user-installed package.
- Closes v1.1 P5; P6 (stack adaptation post-scaffold) and P4 (persona-distribution telemetry, gated on ~1 month of adoption) remain open.

---

## [1.28.0] — 2026-05-15

### Added

- **Skill-review pipeline P3 process robustness** (closes Q3 #10e, issue #132). Cross-LLM synthesis from `docs/reviews/2026-04-29-pipeline-meta/synthesis.md` identified three process-integrity gaps; this release closes all three.
  - **P3.1 — Phase 1 → Phase 2 mechanical gate (CC5).** Before Phase 2 of `/skill-review` can begin, the reviewer must emit a PASS\|FAIL table covering all 8 Phase 1 preflight steps. Phase 2 entry requires 100% PASS — a FAIL row cannot be overridden by reviewer judgment. This closes the "Stage A → Stage B" gate that existed in the framework as a declaration with no enforcement artifact behind it. Added to `REVIEW_FRAMEWORK.md` (tier-M and tier-L) and to the Interactive decision points list.
  - **P3.2 — Behavioral fixture targets expanded from 6 to 11 stack-dependent skills (CC7).** The D1 fixture target set covered ui-audit, visual-audit, accessibility-audit, security-audit, api-design, and migration-audit; P3.2 adds perf-audit, responsive-audit, test-audit, ux-audit, and skill-db. Each added skill is stack-dependent — mode dispatch, dialect-specific output, parser auto-detection, browser-specific behavior — and textual review alone misses the defect classes the fixture pack is designed to catch. Updated `SKILLS_INVENTORY.md` (canonical list with rationale and D1\|P3.2 source tags), `REVIEW_FRAMEWORK.md` Phase 2.E header and Review closing criterion #8, and `SKILL.md` tier-L mode description and Phase 2.E anchor. Side-effect: a pre-existing disagreement between `REVIEW_FRAMEWORK.md` (which listed a different set of 6 skills) and `SKILLS_INVENTORY.md` is now resolved; the canonical list lives in the inventory and is referenced everywhere else.
  - **P3.3 — Phase 10 final mechanical sweep at cycle closure (CC6).** New phase added to `REVIEW_FRAMEWORK.md` (tier-M and tier-L): after the Phase 6 GO on the last skill, re-run Phase 1 preflight against the final framework spec across all 17 reviewed skills. The sweep is mechanical only — no MITL, no LLM jury, no walkthrough. FAIL rows don't block closure but must be logged as follow-up items for the next cycle; the sweep itself cannot be silently skipped. This addresses drift from pipeline hardening that lands incrementally during a cycle, leaving early-reviewed skills calibrated to an earlier framework version. Tier-M lite mode skips Phase 10 alongside Phase 4 and Phase 9 (portfolios under 6 skills).
- New "Phase 10" section in `SKILL.md` tier-L runbook; lite-mode skip statement in `SKILL.md` tier-M extended to cover Phase 10.

### Changed

- `REVIEW_FRAMEWORK.md` "Per-skill pipeline" intro: now reads "Six phases per skill + Phase 9 midpoint (mid-cycle) + Phase 10 final mechanical sweep (cycle closure)."
- `REVIEW_FRAMEWORK.md` Phase 1 fail handling: routes findings through the new mechanical gate instead of the prior informal "Critical findings block Phase 2" wording.
- `docs/operational-guide.md` `/skill-review` entry rewritten to reflect the gate, the 11-skill fixture target set, and Phase 10.
- `REVIEW_FRAMEWORK.md` Review closing criterion grew from 8 to 9 conditions: Phase 10 execution + follow-up logging is now a release gate.

### Notes

- Vocabulary alignment: the synthesis used "Stage A / Stage B", "Phase 1b", "C1-C14", "MITL stop #1" from the meta-review prompt bundle. Shipped framework vocabulary (Phase 1 / Phase 2 / ... / Phase 9 / Phase 10, C1-C8) is preserved; the gate and fixture-set changes are mapped to the shipped names. No double-vocabulary debt added.
- Files touched: 6 (4 framework/inventory mirrors + 2 SKILL.md runbooks). Strict parity between tier-M and tier-L for `REVIEW_FRAMEWORK.md` and `SKILLS_INVENTORY.md`.

---

## [1.27.0] — 2026-05-14

### Added

- **Tier M and L coverage in the schema.** v1.0-1.2.6 capped `tier.selected` to `'0' | 's'` and raised `TIER_NOT_SUPPORTED_V1` on M/L. v1.27.0 widens the enum to `'0' | 's' | 'm' | 'l'` and reintroduces the feature flags the legacy wizard already collected:
  - `commands.build`, `commands.e2e` (optional, nullable)
  - `features` block (optional, tier M/L only): `has_api`, `has_database`, `has_frontend`, `has_design_system`, `design_system_name`, `has_prd`
  - `audit_model` (string, optional)
- **Inter-field constraints** added to the Zod schema:
  - **C7** — `features.has_design_system=true` requires `features.design_system_name`
  - **C8** — `features` block forbidden on tier 0/S (no consumers in the scaffold)
- PM flow + dev flow ask the M/L extras only when `tier in {m, l}` (and `hasDesignSystem`/`auditModel` only when `hasFrontend=true`).
- `init.dispatchFromContext` forwards the new fields to the legacy `init-*` sub-flows so a CONTEXT.md with tier M/L scaffolds deterministically without re-prompting.
- 4 new fixtures: `valid-tier-m.md`, `valid-tier-l.md`, `invalid-c7-design-system-missing-name.md`, `invalid-c8-features-on-tier-s.md`.
- 2 new tests in `validate-context.test.js` for C7 and C8; 4 new flow tests (PM tier M, PM tier L, dev tier M, dev tier L).

### Changed

- `HARD_STOP_TIERS` export in both `pm-flow.js` and `dev-flow.js` is now an empty array, kept for source-compat with any plugin that imports it. Legacy callers stop seeing the `TIER_NOT_SUPPORTED_V1` throw.

### Notes

- 554/554 unit tests pass (+4 from the new tier M/L coverage). Lint + format clean.
- Backward-compatible by construction: every CONTEXT.md produced by v1.23-v1.26 (tier 0/S, no `features` block) still validates without change.
- Closes v1.1 P3, the last item from the reopened roadmap. v1.1 is now feature-complete.

---

## [1.26.0] — 2026-05-14

### Added

- **`--from-yaml <file>` bypass on `context`** — validate an existing `CONTEXT.md` or a raw YAML config and copy it into the cwd, skipping interview, inference, and review entirely. The bypass accepts two input shapes: full markdown with frontmatter (passed through unchanged), or raw YAML (wrapped with `---` delimiters + `DEFAULT_BODY` placeholder). On schema failure, nothing is written and the process exits 1 with the same human-readable error format used by `validate-context`. Combines with `--all` to chain `init` after the copy.
- `packages/cli/src/commands/context.js` (MODIFIED) — `runFromYamlBypass()` and `normalizeFromYamlSource()` exported for programmatic use; the `contextCommand()` entry short-circuits to the bypass when `--from-yaml` is set.
- `packages/cli/test/unit/context-builder/from-yaml-bypass.test.js` (NEW) — 11 tests: 3 normalizer cases + 4 programmatic bypass cases (raw YAML, full MD, missing file, invalid schema) + 4 CLI subprocess cases (valid / invalid / missing / `--help`).

### Use cases

- CI / automation: a template CONTEXT.md committed to the repo, validated and consumed by `init --use-context` in CI without any prompt.
- Expert dev / template sharing: hand-edit a CONTEXT.md or copy one from another project, then bring it in deterministically.
- Reproducibility: regenerate the same scaffold across machines by checking in the source CONTEXT.md and running `context --from-yaml` + `init --all`.

### Notes

- 550/550 unit tests pass (+11 from the new bypass coverage).
- Closes v1.1 P2 from the reopened roadmap. P3 (tier M/L coverage in schema) remains ahead.

---

## [1.25.0] — 2026-05-14

### Added

- **`validate-context` sub-command** — `npx mg-claude-dev-kit validate-context [file]` runs the 16 MUST PASS + 6 inter-field checks against a hand-edited or generated `CONTEXT.md` and exits 0 on pass, 1 on any failure. Defaults to `./CONTEXT.md` when no path is given. `--json` switches output to a parseable JSON shape (`{ valid, errors, data, body }`) on stdout, regardless of pass/fail. Use case: CI gating (`npx mg-claude-dev-kit validate-context && npm run build`), pre-commit hooks on hand-edited CONTEXT.md, reproducible sanity check.
- `packages/cli/src/commands/validate-context.js` (NEW) — exposes `buildValidationOutput()` (pure formatter) and `validateContext()` (CLI entry).
- `packages/cli/test/unit/context-builder/validate-context-command.test.js` (NEW) — 12 tests: 5 pure-formatter cases + 7 CLI subprocess integration tests (valid / invalid / missing / `--json` / default path / `--help`).

### Notes

- 539/539 unit tests pass (+12 from the new CLI command).
- The validator function itself is unchanged from v1.23.0; this is a CLI surface, not a logic change.
- Closes v1.1 P1 from the reopened roadmap. P2 (`--from-yaml`) and P3 (tier M/L) remain ahead.

---

## [1.24.0] — 2026-05-14

### Changed

- **Dev flow ricablato sul wizard tecnico legacy**. v1.23.0 routed the `Software Engineer` and `Tech Lead` personas to a stub that fell back into the PM flow, which then forced PM-style prompts (`tier.rationale`, three body prose questions) on developers who already knew the answers. The dev branch now runs its own interview, reusing the technical questions from the legacy `init-greenfield` / `init-in-place` / `init-from-context` wizards: `projectName`, `description` (greenfield only), `techStack`, `testCommand`, `typeCheckCommand` (node only), `devCommand`, `includePreCommit`, `includeGithub`. `tier.rationale` is auto-derived from `teamSize + workScope` ("Solo developer, bugfix-sized changes (≤3 files)"). Body markdown defaults to placeholder for greenfield; in existing-mode the Phase 2 LLM fills sections when reachable, with silent fallback otherwise.
- **Phase 2 LLM errors in dev flow are swallowed silently**. A dev running offline or without `ANTHROPIC_API_KEY` is no longer blocked.

### Added

- `src/context-builder/interview/dev-flow.js` — replaces `dev-flow-stub.js`.
- `src/context-builder/interview/shared/stack-defaults.js` — extracted from `pm-flow.js` so both flows share one source of truth.
- `src/context-builder/interview/shared/derive-rationale.js` — auto-derive logic with 4 unit tests.
- `test/unit/context-builder/dev-flow.test.js` — 22 new tests covering greenfield + existing + tier 0 + tier M/L hard stop + Phase 2 silent skip + Phase 2 body sections.

### Removed

- `src/context-builder/interview/dev-flow-stub.js` (was a v1.0 placeholder).

### Notes

- 527/527 unit tests pass (+22 from the new dev-flow coverage).
- Schema v1 unchanged. PM flow unchanged. The dev flow produces the same schema-conformant `CONTEXT.md` via a different question set.
- Closes a v1.23.0 design error documented retroactively in `memory/project_context_builder_scope_v1.md`. v1.1 priorities P1-P3 (validate-context CLI, `--from-yaml`, tier M/L) remain ahead.

---

## [1.23.0] — 2026-05-12

### Added

- **Context Builder — `context` sub-command** that writes a `CONTEXT.md` for `init` to consume. Greenfield runs a PM-friendly interview; existing repos go through three-phase inference: algorithmic `detect-stack` wrap, LLM extraction, hybrid PM review. The frontmatter is Zod schema v1: 16 MUST PASS structural checks plus six inter-field constraints (tier-0 forces scaffold options off, mode-greenfield excludes sources/inference, dotted-path keys for `confidence` and `pending_decisions`, and so on). The body has three sections: What we are building, Operational constraints, Open questions.
- **`init` reads CONTEXT.md** when it finds one in the cwd and scaffolds deterministically, no further prompts. `--ignore-context` falls back to the prompt-based flow.
- **Persona check Q1** routes to the PM flow or the dev-flow stub. Five options: Software Engineer / Developer, Product Manager, Tech Lead, Founder / Solo builder, Other. Developer and Tech Lead hit the dev stub for now — the real dev-oriented interview lands in v1.1, once PM-driven research is in.
- **`--all` flag on `context`** chains `init` right after writing `CONTEXT.md`, so the two steps collapse into one command.
- **`validate-context.js`** utility: deterministic MUST PASS validator covering file presence, frontmatter parse, schema conformance, and inter-field constraints. Exposed as `validateContextFile()` and `validateContextContent()`. Called by `context` after write and by `init` before scaffold.
- **JS dependency**: `js-yaml ^4.1.1` for frontmatter parsing.

### Pilot test results

- **3/3 PASS strict** on the locked acceptance gate (R1 greenfield, R2 staff-manager Node-TS, R3 python-audit-project) across a 3-model cross-LLM rubric. Substitute jury this round: Perplexity sonar-pro + OpenAI gpt-4o + Mistral Large. The locked jury is Opus + Sonnet + Gemini — see `docs/reviews/context-builder-pilot-v1.md` for the caveats.
- Phase 2 LLM extraction ran end-to-end on the OpenAI gpt-4o stand-in.
- Tests: 499/499 unit tests pass (+91 new for context-builder).

### Notes

- Tier M and L are out of scope for the v1 schema. Picking them in the PM flow raises `TIER_NOT_SUPPORTED_V1` and redirects to the legacy wizard.
- The legacy `init-greenfield`, `init-in-place`, and `init-from-context` modules still work. The v1 → v2 deprecation path lives in `memory/project_context_builder_implementation_v1.md`.
- `docs/reviews/context-builder-pilot-v1.md` is gitignored; that report stays local to the maintainer.

---

## [1.22.0-postrelease-docs] — drift sync

### Changed

- **Documentation drift sync** (no behavior change). Realigned README, CONTRIBUTING and `docs/operational-guide.md` with the v1.22.0 codebase after a deep-review pass surfaced stale numbers and missing sections.
  - Test counts updated: 1129 integration checks (was 979), 373 unit tests across 61 suites (was 332 across 50), ~118 integration scenarios (was ~40).
  - Doctor count updated: 29 checks (was 28). The numbered list in operational-guide §13 now includes `team-settings-runtime-hook`, scaffolded back in v1.21.0 but never enumerated.
  - Audit-skill count corrected to 24 (was 22) by adding `/dependency-scan` (Tier M+L) and `/context-review` (Tier L) to the README skill table. Both were already covered in operational-guide §11 as pipeline-integrated skills; the README simply omitted them.
  - MCP-server tool count corrected to six (was five). `cdk_pr_review` shipped as the sixth tool but the introductory sentence was never updated.
  - Operational-guide §10 now has dedicated entries for `/dependency-audit` and `/pr-review`, which were listed in the README skill table but missing from the per-skill detail section.
  - Operational-guide footer bumped from "v1.10.4" to "v1.22.0".
  - Hardcoded "1129 integration checks" badge removed from the README header to retire a recurring per-release maintenance debt; the exact count remains in §Testing.
  - Statements about v1.16.0 and v1.17.0 in the operational-guide reframed in past tense so readers do not infer those are the current state.

---

## [1.22.0] — 2026-04-28

### Added

- **`/skill-dev` Step 3b — Hotspot priority (churn × debt)**: new step computes a remediation priority matrix by intersecting per-file debt count (from Step 2 D1–D10 + Step 3 J1–J5 matches) with code churn from `git log --since="6.months.ago" --numstat`. Ranks files into 4 quadrants (Q1 hot mess / Q2 stable rot / Q3 flaky frontier / Q4 cold corner) and renders a top-10 hotspot table in the audit report. Origin: 2026-04-28 cross-LLM verdict on Issue #97 sub-track 2 (`/debt-triage` was closed; the differentiating churn-axis prioritization was folded here per all three reviewers' convergent recommendation).
- **Hotspot priority report section**: between "Findings requiring action" and "Backlog decision gate". Top-10 rows max, sorted Q1 first by debt_count desc, then Q2/Q3/Q4. Skips with explicit "Hotspot table skipped: insufficient signal" wording on non-Git projects or projects with < 5 files showing both debt and churn.
- **Integration scenario `scenarioSkillDevHotspot`** in `test/integration/run.js`: validates Step 3b presence, git log churn command, 4-quadrant matrix wording, report section header, and fallback wording. Tier-s + tier-m + tier-l (skill-dev minTier='s' so it ships in all three).

### Changed

- `/skill-dev` SKILL.md body: 330 → 368 lines (+38 lines for Step 3b + report section). Tier-s + tier-m + tier-l byte-identical.
- Integration test count: 1114 → 1129 (+15 from `scenarioSkillDevHotspot`).
- README skill table: `/skill-dev` row now mentions Step 3b hotspot priority.

### Notes

- v1.22.0 is intentionally minimal in scope. The cross-LLM verdict on 2026-04-28 said the differentiation between `/debt-triage` and `/skill-dev` was the churn-axis prioritization, nothing else. This release adds exactly that, no more. `/debt-triage` stays closed.
- The 6-month churn window is hard-coded for v1.22. A configurable window via `CLAUDE.md` comment is documented in the skill body as a future iteration; the maintainer's bias is to ship the simple version first and add configurability only if a real project surfaces a need.
- Hotspot priority does NOT gate the backlog. Every finding above Low severity still goes through Step 4's debt-density escalation + regression-risk downgrade unchanged. The hotspot section re-orders backlog work by leverage; it does not add or remove findings.
- This release closes the work item created by the 2026-04-28 cross-LLM verdict. Issue #97 sub-track 3 (`/privacy-audit`) remains deferred per the criteria pinned in that comment.

---

## [1.21.0] — 2026-04-28

### Added

- **`team-settings.json` runtime enforcement hook** (smoke-test review proposal, ICE ~240). New `.claude/hooks/team-settings-enforcement.mjs` script wired as a `PreToolUse` hook on the `Skill` matcher in `.claude/settings.json`. Refuses skill invocations that violate `blockedSkills` or `allowedSkills` at runtime, before the skill body executes. Closes the credibility gap flagged on v1.16: previously `team-settings.json` enforcement was CLI-only (a Claude Code session could bypass it by typing `/skill-name` directly); now it's mechanical at the agent runtime.
- **Doctor check `team-settings-runtime-hook`** (warn-level): verifies the hook script is scaffolded AND `.claude/settings.json` registers it on the Skill matcher. Skips silently when `.claude/team-settings.json` is absent (unrestricted projects don't need the hook). Doctor check count: 28 → 29.
- **Integration scenario `scenarioRuntimeEnforcementHook`** in `test/integration/run.js`: validates hook scaffolding across tier-s/m/l, settings.json registration, behavior on no-team-settings (allow), `blockedSkills` (deny JSON), `allowedSkills` whitelist (deny + custom-\* bypass), non-Skill tools (passthrough), malformed settings (fail-open), and the doctor check passing/warning paths. ~14 new assertions.
- **Hook protocol implementation** matches the Anthropic [PreToolUse hook spec](https://code.claude.com/docs/en/hooks): reads JSON from stdin (`tool_name`, `tool_input.skill_name`), returns `hookSpecificOutput.permissionDecision = "deny"` with reason on stdout for blocked invocations, exits 0 silently to allow.

### Changed

- All three tier templates (`tier-s/.claude/settings.json`, `tier-m`, `tier-l`) now register the `PreToolUse` Skill matcher. Tier-l merges with the pre-existing PreToolUse Bash destructive-command guard (the previous duplicate-key issue is fixed in this release).
- Integration test count: 1100 → 1114 (+14 from `scenarioRuntimeEnforcementHook`).

### Notes

- The hook is intentionally fail-open. Any error (malformed stdin, missing project root, JSON parse failure, unexpected exception) results in exit 0 with no output (skill invocation is allowed). Rationale: the hook is a value-add, not a critical path; a bug in the hook itself should never lock a user out of all skills. The doctor `team-settings-compliance` check surfaces parse errors in interactive runs.
- Custom skills (`custom-*` prefix) bypass the `allowedSkills` whitelist (matches v1.16 CLI semantics) but NOT the `blockedSkills` denylist (governance overrides the "custom skills preserved across upgrades" convention). The hook implements both rules consistently with the CLI side.
- The hook script is self-contained (no CDK package dependency at hook-execution time) so user projects don't need to keep `node_modules` for it. It uses only Node built-ins (`node:fs`, `node:path`).
- Hook timeout is 5 seconds. The hook script does I/O on a small JSON file and exits, well under the budget. If the hook ever exceeds 5s, treat it as a CDK bug, not a user-config issue.
- This release closes the architectural feedback loop opened by the 2026-04-26 smoke-test review on v1.16.

---

## [1.20.0] — 2026-04-27

### Added

- **`/security-audit` MCP-aware Step 3c** (Q3 #4b sub-track 1, Issue #119, ICE 210): when the [`mcp-nvd`](https://github.com/marcoeg/mcp-nvd) server is wired in `~/.claude/.mcp.json` (or project-scoped), the skill calls `mcp__mcp-nvd__search_cve` for each direct production dependency and consumes live CVE data with severity, affected version range, fixed version, publication date. Falls back to existing local audit commands (`npm audit`, `pip-audit`, `cargo audit`, etc.) with explicit warning when the MCP server is unreachable. Frontmatter declares the consumed `mcp__*` tools. Tier-s + tier-m + tier-l byte-identical.
- **`/dependency-audit` MCP-aware Step 2** (Q3 #4b sub-track 2): when [`package-registry-mcp`](https://github.com/Artmann/package-registry-mcp) is wired, the skill calls `mcp__package-registry-mcp__lookup_package` for current package metadata (latest version, repository URL, maintainer, dist-tags) and uses the returned repo URL to fetch the GitHub releases changelog. Falls back to WebFetch with explicit warning when the MCP server is unreachable. Tier-m + tier-l byte-identical.
- **Integration scenario `scenarioMcpAwareSkillsV120`** in `test/integration/run.js`: validates frontmatter declares the expected `mcp__*` tools, body contains the MCP-aware path + fallback wording, and pinned server repo URLs are present. ~15 new assertions across tier-s/m/l.

### Changed

- Integration test count: 1085 → 1100 (+15 from `scenarioMcpAwareSkillsV120`).

### Deferred

- **`/arch-audit` MCP-aware** (Q3 #4b sub-track 3): originally part of the Issue #119 scope. After 2026-04-26 research, no production-grade MCP server exists for Anthropic's Claude Code spec / `code.claude.com/docs`. Wrapping the existing WebFetch path in an MCP layer would have added indirection without measurable value; pinning a research-grade community server would have reduced reliability. Defer until either (a) Anthropic publishes an official spec MCP server (likely entry as Claude Cowork integrations expand) or (b) a community server reaches production-grade stability with multi-vendor signal. Re-score in v1.21.x.

### Notes

- This release intentionally does NOT generate a mock MCP server fixture for integration testing. The skill instrumentation is content-level (frontmatter + body); the actual MCP invocation happens at Claude Code session time, outside CI scope. A mock fixture would only be useful for testing CDK CLI code that itself invokes MCP, which v1.20.0 does not add. Future v1.20.x releases that add MCP-invoking CLI code (e.g., `cdk_pr_review_run` write tool) will need the fixture.
- The fallback path in both skills is intentionally adoption-friendly: MCP-aware is a value addition, not a requirement. Projects without MCP wiring see the warning and continue with the prior static logic. Audit coverage never regresses.
- The third skill choice (`/dependency-audit` over `/infra-audit` and `/test-audit`) was decided on the basis of staff-manager `/deps-audit` having just been ported in v1.18.0; the changelog/registry path was already familiar, lowering implementation risk. `/infra-audit` MCP-aware (Terraform Cloud / AWS MCP servers) is a future candidate.

---

## [1.19.0] — 2026-04-26

### Added

- **`/pr-review` skill** (Q3 #4d, Issue #122, ICE 267 cross-LLM): autonomous local PR review via `gh` CLI. Spawns a review subagent on the diff with universal + stack-specific severity criteria, posts the review as a PR comment for audit trail, surfaces a merge decision. Read-only: never modifies code, never auto-merges. Stack-aware via sibling PATTERNS.md (node-ts, python, swift in v1; agnostic fallback for the rest). `--deep` flag escalates to opus for sensitive changes. `--with-context` is opt-in for project-context-aware review.
- **`prReviewSeverity` extension** to `team-settings.json` schema (Option β): an optional object with `critical` / `major` / `minor` glob arrays that override + extend the universal defaults. Validation rejects non-array level fields and non-string entries.
- **`getPrReviewSeverity()` helper** in `team-settings.js`: returns the parsed override (mutation-safe copies) or `null` when absent.
- **`cdk_pr_review` MCP tool** on the v1.17.0 governance MCP server (Mistral's cross-LLM recommendation): reads the audit trail of `/pr-review` skill comments on a GitHub PR — repo, PR metadata, list of skill review comments with verdict + severity counts + body preview, plus the exact CLI invocation needed to generate a fresh review. Read-only: does not run a fresh review itself; that requires the CDK CLI (orchestration too involved to expose as a single MCP call in v1).
- **`zod` (^4.3.6)** added as direct dependency (was transitive via `@modelcontextprotocol/sdk`). Used to define the `cdk_pr_review` MCP tool input schema.
- **Integration scenario `scenarioPrReviewPresent`** in `test/integration/run.js`: tier presence + pruning, PATTERNS.md top-3-stack coverage, read-only invariant (hard rules in body), cheatsheet row, Phase 8 pipeline.md invocation, valid + invalid `prReviewSeverity` validation through `doctor --report`.
- **Pipeline.md Phase 8 step 9** in tier-m + tier-l: optional `/pr-review` invocation after CI green, before promotion to production.

### Changed

- Skill registry length: 23 → 24 (`pr-review` added).
- README skill count: 21 → 22 (table row added).
- MCP server tools: 5 → 6 (`cdk_pr_review` added).
- Integration test count: 1046 → 1085 (+39: ~23 from `scenarioPrReviewPresent` + auto-pickup by parameterized scenarios + 1 fix to MCP tool list assertion to expect 6 tools).
- Unit test count: 365 → 373 (+8 for `prReviewSeverity` validation suite + `getPrReviewSeverity` helper).

### Notes

- The cross-LLM evaluation returned unanimous SHIP with Impact pushed up by all four reviewers (maintainer 7, cross-LLM 8-9). Gemini specifically called this skill a "potential killer application" that operationalizes the "review-before-merge" moat described in CDK's roadmap.
- The MCP tool is intentionally lightweight in v1: it reads existing review comments and points to the CLI for fresh reviews. Generating a full review from MCP would require the server to orchestrate a subagent + post a comment + return the result, which is multi-step and stateful in ways MCP's request-response model doesn't natively support. Once adoption justifies the lift, v2 can expose a richer `cdk_pr_review_run` write tool.
- Severity criteria are layered: universal defaults in `SKILL.md`, stack-specific additions in `PATTERNS.md` (when the stack matches), project overrides in `team-settings.json` `prReviewSeverity` (when present). The skill body documents the precedence.
- Out of scope in v1: CI workflow auto-running `/pr-review` on every PR, auto-merging based on verdict, multi-language reviewer comments. Each is a separate v2+ track.

---

## [1.18.0] — 2026-04-26

### Added

- **`/dependency-audit` skill** (Q3 #6, Issue #97, ICE 281 cross-LLM): port + agnosticization of the staff-manager `/deps-audit` skill (just released on `worktree-deps-audit-skill`). Stack-agnostic core SKILL.md (217 lines) + per-stack PATTERNS.md sibling (194 lines, top 3 stacks: node-ts, python, swift). Tier A/B/C classification, changelog summary for Tier B/C, codebase impact grep, runtime LTS check. Audit-only in v1; mutating `apply-tier-a` mode scheduled for Q4 per cross-LLM push-back.
- **Integration scenario `scenarioDependencyAuditPresent`** in `test/integration/run.js`: tier presence + pruning, PATTERNS.md top-3-stack coverage, audit-only invariant (apply mode confined to Out of scope), cheatsheet row, Track C pipeline.md invocation.
- **Cheatsheet rows** in tier-m + tier-l: `/dependency-audit` after `/compliance-audit` with usage cadence.
- **Pipeline.md Track C invocation** in tier-m + tier-l: skill invokes when the block touches a dependency manifest (`package.json`, `pyproject.toml`, `Package.swift`, `Cargo.toml`, `go.mod`, etc.).

### Changed

- Skill registry length: 22 → 23 (`dependency-audit` added; existing `dependency-scan` is unchanged, a separate skill used as an internal Phase 1 entity-dependency tracker).
- README skill count: 20 → 21 (table row added).
- Integration test count: 1009 → 1046 (+37: 9 from new scenario, 28 from existing parameterized scenarios picking up the new skill via the registry).

### Notes

- The cross-LLM evaluation (GPT-4.1, Gemini 2.5 Pro, Mistral Large, Perplexity Sonar Pro) returned unanimous SHIP with ICE re-scores 216/294/336/336 (avg 281). All four reviewers raised the maintainer's preliminary 252. Mistral specifically pushed back on indefinite deferral of mutating mode; Q4 commitment is now explicit in the skill body's "Out of scope" section.
- Parent Issue #97 originally bundled three skills (`/dependency-audit`, `/debt-triage`, `/privacy-audit`); this release narrows to the first. The other two remain in the same Issue as separate sub-tracks for future re-scoring.
- The skill is agnostic to package manager (npm / pnpm / pip / uv / poetry / SPM / Cargo / Maven / Gradle / dotnet / bundler). Stack detection picks the right inventory command at Step 0.

---

## [1.17.0] — 2026-04-26

### Added

- **CDK governance MCP server** (Q3 #4a, Issue #118, ICE 294): a local Model Context Protocol server that exposes CDK's existing JSON outputs as MCP tools. Any MCP-aware client (Claude Desktop, ChatGPT desktop, Cursor, VS Code, Copilot Studio) can now query CDK project health without the CDK CLI installed. Five read-only tools: `cdk_doctor_report`, `cdk_team_settings`, `cdk_arch_audit_status`, `cdk_skill_inventory`, `cdk_package_meta`.
- **`claude-dev-kit-mcp` binary**: shipped in the same npm package as the existing `claude-dev-kit` CLI. Single `npm install -g`, two binaries, version-locked. Wire up via `.mcp.json` or `~/.claude/.mcp.json`:
  ```json
  { "mcpServers": { "cdk": { "command": "claude-dev-kit-mcp" } } }
  ```
- **`@modelcontextprotocol/sdk` (^1.29.0)** added as dependency. ESM-only, stdio transport, official Anthropic SDK.
- **Integration scenario `scenarioMCPServer`** in `test/integration/run.js`: end-to-end test that spawns the MCP server as a child process, connects via the SDK client, lists tools, calls each tool, and verifies the JSON shape — both on a fully scaffolded project and on a clean scaffold (everRan=false, present=false).

### Changed

- npm `bin` entries: `mg-claude-dev-kit` package now ships `claude-dev-kit` and `claude-dev-kit-mcp` together. No standalone CLI version exists.
- Integration test count: 1000 → 1009 (+9 from `scenarioMCPServer`).

### Notes

- This is the first release in which CDK is itself an MCP citizen. Previously, CDK _consumed_ MCP via the Playwright tools wired into the visual / responsive / accessibility / UI skills. Now CDK _publishes_ an MCP server too, closing the asymmetry flagged in the 2026-04-26 MCP reassessment.
- Read-only tool surface in v1.17.0 by design. Mutating tools (`cdk_apply_skill`, `cdk_run_doctor` triggered remotely) are deferred until adoption signal supports them.
- Q3 #4b (MCP-aware audit skills, Issue #119, ICE 210) is the natural follow-on once 4a is in production. Schedule TBD.

---

## [1.16.0] — 2026-04-25

### Added

- **`team-settings.json` governance file** (Q3 #3, Issue #94, ICE 175): opt-in `.claude/team-settings.json` for team-wide CLI policy. Schema v1: `minTier` (s | m | l), `allowedSkills`, `blockedSkills`, `requiredSkills`. Empty/absent file = unrestricted (full backward compatibility).
- **CLI enforcement** across `init`, `upgrade`, and `add skill`. `init` refuses scaffolds that violate `minTier` and explains the violation. `upgrade` refuses on `minTier` violation in an existing scaffold and suggests `init --tier=<min>` to promote. `add skill` refuses skills that are blocked or absent from the `allowedSkills` whitelist (`custom-*` skills bypass the whitelist by design).
- **Doctor check `team-settings-compliance`** (warn-level): flags `minTier` violations on the current scaffold, blocked skills present in `.claude/skills/`, missing `requiredSkills`, and reports schema parse errors with the exact field. Doctor check count: 27 → 28.
- **Schema validation** with descriptive errors: malformed JSON, unknown `minTier` value, non-array skill lists, non-string skill entries, and `allowedSkills ∩ blockedSkills` overlap (mutual exclusion).
- **Helpers** in `packages/cli/src/utils/team-settings.js`: `readTeamSettings`, `validateTeamSettings`, `violatesMinTier`, `isSkillBlocked`, `isSkillAllowed`, `getRequiredSkills`. CLI-side wrappers in `team-settings-cli.js` (`loadTeamSettingsOrExit`, `enforceTeamSettingsTier`).
- **Integration scenario `scenarioTeamSettings`** in `test/integration/run.js`: 10 assertions covering absent file (skip), `minTier` violation (doctor warn + upgrade refuse), blocked skill add (refuse), allowed-list whitelist refuse, missing required skill (doctor warn), allowed/blocked overlap (doctor warn), malformed JSON (upgrade exit), and `custom-*` semantics (whitelist bypass + blocklist enforcement).
- **Unit tests** in `test/unit/team-settings.test.js`: 22 cases covering parser, validator, mutual exclusion, `violatesMinTier` precedence, `isSkillBlocked`/`isSkillAllowed` semantics including `custom-*` bypass, and `getRequiredSkills` array immutability.

### Changed

- Doctor JSON `--report` now includes `info` on `warn` and `fail` results (previously only on `pass`). Existing checks gain diagnostic context in CI output without behavior change.
- Integration test count: 990 → 1000 (+10 from `scenarioTeamSettings`).
- Unit test count: 343 → 365 (+22 from `team-settings.test.js`).

### Notes

- v1.16.0 enforcement is **CDK-only**. Skill restrictions and model selection are not translated to native `permissions.allow/deny` in `.claude/settings.json` because Claude Code's `Skill()` permission rule is not part of the documented public schema. Generation of native rules will land once the upstream contract is verified, tracked for v1.17+. Until then, governance is enforced when the user runs the CDK CLI; Claude Code sessions can still invoke skills directly.
- `init-from-context` does not enforce `team-settings.json`. The target directory is greenfield (newly created), so a parent `team-settings.json` does not propagate by design.

---

## [1.15.0] — 2026-04-25

### Added

- **`upgrade --anthropic` flag** (Q3 #2, Issue #93, ICE 210): refreshes files that encode Anthropic spec / best practices, separately from the standard `upgrade` flow. Default behavior is dry-run with a colourized unified diff (via the `diff` npm package) so the contributor reviews the change before committing it. `--apply` writes the new content with a timestamped backup file (`<original>.bak.<ISO-timestamp>`) for the previous version. Combinable with the standard upgrade in a single invocation.
- **`ANTHROPIC_FILES` registry** in `packages/cli/src/commands/upgrade.js`: a list of templates that are 1:1 copied to a scaffold (no placeholder interpolation, no flag-based section stripping) and therefore safe to compare raw. v1.15.0 scope is one file: `.claude/skills/arch-audit/advanced-checks.md`. Files that pass through the scaffold transformation pipeline (`pipeline-standards.md`, `claudemd-standards.md`, `arch-audit/SKILL.md`) stay in `REVIEW_REQUIRED` until a transformation-aware compare is implemented in a future release.
- **Helper exports** from `upgrade.js`: `backupPath(originalPath, now)` and `detectScaffoldedTier(cwd)`. Used by both the upgrade command and the new doctor check.
- **Doctor check `anthropic-files-current`**: warns when any of the `ANTHROPIC_FILES` differs from the installed CDK template. Doctor check count: 26 → 27.
- **Integration scenario `scenarioUpgradeAnthropic`** in `test/integration/run.js`: scaffolds tier-m and tier-s projects, exercises the dry-run / `--apply` / `.bak` / no-tier-detected paths, and cross-checks the doctor `anthropic-files-current` status before and after refresh. ~11 new integration assertions.
- **Unit tests** in `test/unit/upgrade-anthropic.test.js`: 11 cases for `ANTHROPIC_FILES` registry shape, `backupPath` ISO timestamp formatting, and `detectScaffoldedTier` against tier S / M / L / unrecognized H1 / missing pipeline.md.

### Changed

- New dependency `diff` (^9.0.0) added to `packages/cli/package.json`. Unified-diff generation is cross-platform (no shell-out to system `diff`).
- Integration test count: 979 → 990 (+11 from `scenarioUpgradeAnthropic`).
- Unit test count: 332 → 343 (+11 from `upgrade-anthropic.test.js`).

### Notes

- The v1.15.0 `--anthropic` scope is intentionally narrow. It establishes the contract (flag, dry-run, backup, doctor wiring) on a single file that the scaffold copies 1:1 from the template. Expanding the registry to files that go through `interpolate()` or section stripping requires a transformation-aware compare (likely re-running the scaffold pipeline against the user's current config), tracked for v1.16+.

### Documentation

Rolled in from PR #114 (originally merged docs-only without version bump):

- **CONTRIBUTING.md overhaul** (Q2 #6, ICE 256): full restructure to 11 sections aligned to v1.14.0 state. Closes the "Partial" status from PR #46 (2026-04-02).
  - Refreshed test counts (979 integration, 332 unit) and removed the stale "(currently 19)" doctor-check reference.
  - Expanded project structure with `docs/`, `scripts/`, recent utilities (`skill-frontmatter.js`, `doctor-cross-file.js`, `constants.js`, `stack-commands.js`).
  - New section "Design principles": mechanical over judgment-heavy, stack-aware depth, agnostic-only patterns in templates, byte-identical Tier M/L, 500-line `SKILL.md` body budget, spec-compliant `allowed-tools` syntax.
  - New section "Process governance" exposes R1 (`/commit` skill mandatory) and R2 (`/humanize` on user-facing GitHub prose) publicly. Documents atomic-commits-per-skill convention with the per-commit `skill-registry.test.js` length-assertion bump pattern. Notes prettier-before-staging and mid-feature `wc -l` budget checkpoints.
  - New section "Adding a new skill" with a 9-step inline walkthrough: registry entry shape, frontmatter schema, sibling files (`PATTERNS.md` / `REPORT.md` / `PROFILES.md` / `advanced-checks.md`), Tier M/L copy verification, cheatsheet row, pipeline.md Track A/B/C invocation, integration scenario via `assertSkillPresent` helper, backlog ID prefix selection, documentation touch points. Includes minimal but compilable code examples.
  - New section "Testing strategy" describes the unit/integration two-layer setup, fixture conventions, the custom `pass()`/`fail()` reporter, output-dir gitignore.
  - New section "How PRs are reviewed" with explicit must-have / nice-to-have / auto-reject criteria.
  - New section "For maintainers" at end of document: release process (tag, humanized GitHub Release, issue close, roadmap sync, GitHub Project Status update), npm publish guidance, `gh auth` switching protocol, branch protection notes, pre-release smoke-test protocol.
  - Welcoming intro paragraph framing the moat principle (mechanical > judgment-heavy) for first-time contributors.
  - 387 lines (was 116).

---

## [1.14.0] — 2026-04-25

### Added

- **Three new skills** (Issue #66, Tier M/L) — closes the Q2 #7 bundle:
  - **`/api-contract-audit`** — requires `hasApi: true`. Static OpenAPI contract audit. Eight checks AC1-AC8: endpoint drift (spec vs code set-diff), schema drift (field-level compare of Zod / Pydantic / io-ts / class-validator against spec), status-code mismatch, breaking-change detection vs previous spec (`git show HEAD~1:<spec-path>` diff; required field removed, enum value removed, path removed, type change = Critical), versioning consistency, security scheme alignment, deprecation markers, Richardson Maturity Model scoring L0-L3 (HATEOAS detected via `_links` / `rel` / `href` / HAL / JSON:API patterns in response schema). Framework auto-gen: FastAPI (`/openapi.json` endpoint or decorator parsing), NestJS (`@ApiProperty` decorators), Express + swagger-jsdoc (JSDoc annotations), Next.js 13+ route handlers (`app/api/*/route.ts` + Zod inference), Django REST Framework (`drf-spectacular` / `drf-yasg`). Patterns in sibling `PATTERNS.md`. Backlog prefix `API-`. Runs in Phase 5d Track B.
  - **`/infra-audit`** — universal (no `requires`). Static infra-security audit across five layers, each running only if its markers are detected: **GitHub Actions** (GHA-1..7: pwn-request, secret logging, unpinned actions, permissions overreach, self-hosted runner on public PR, untrusted input in run, workflow modification permission); **Dockerfile** (D-1..6: latest tag, root user, ADD with URL, unpinned base image, secret in build arg, apt without cleanup); **Kubernetes** (K-1..7: runAsNonRoot missing, allowPrivilegeEscalation, privileged container, hostNetwork/hostPID/hostIPC, writable rootfs, secret as env var, imagePullPolicy mismatch); **Terraform** (T-1..6: IAM wildcard action, IAM wildcard resource, public S3, state in git, module without version pin, hardcoded secret); **GitLab CI** (GL-1..4: secret logging, unpinned image, unprotected runner, script injection). Patterns in sibling `PATTERNS.md`. Backlog prefix `INFRA-`. Runs in Phase 5d Track C on every block. Stack-agnostic.
  - **`/compliance-audit`** — universal (no `requires`). Static compliance audit with regulatory profiles. v1.14 ships the **GDPR profile active** (10 checks G1-G10 across 4 pillars: data-subject rights delete/export/rectify, lawful basis + consent, PII identification + encryption-at-rest for Article 9 special-category + logging hygiene, retention + sub-processors). Output includes a mechanical **GDPR readiness tier** (foundational / operational / mature); explicit caveat that the tier is mechanical and does not constitute legal attestation. **SOC 2 and HIPAA profiles scaffolded** in sibling `PROFILES.md` as future-markers with check IDs `SOC2-1..10` / `HIPAA-1..10`, reserved backlog prefixes, and enablement blockers documented (SOC 2: pattern validation against a real enterprise audit engagement; HIPAA: PHI vocabulary validation in a healthcare-domain project). Backlog prefix `GDPR-` (SOC 2 / HIPAA reserved). Runs in Phase 5d Track B. Stack-agnostic.
- New skill scaffolded in `packages/cli/templates/tier-m/.claude/skills/` and `tier-l/.claude/skills/` for each of the three skills (byte-identical across tiers):
  - `api-contract-audit/` — SKILL.md (279 body lines) + PATTERNS.md (framework auto-gen + route discovery + schema extraction + L3 HATEOAS detection)
  - `infra-audit/` — SKILL.md (185 body lines) + PATTERNS.md (5 layer sections)
  - `compliance-audit/` — SKILL.md (285 body lines) + PROFILES.md (GDPR active + SOC 2 / HIPAA future-marker scaffolding)
- Three registry entries in `skill-registry.js`: `api-contract-audit` (`minTier: 'm'`, `requires: { hasApi: true }`, `cheatsheet: true`); `infra-audit` (`minTier: 'm'`, `requires: {}`, `cheatsheet: true`); `compliance-audit` (`minTier: 'm'`, `requires: {}`, `cheatsheet: true`).
- Cheatsheet rows for all three skills in tier-M and tier-L `cheatsheet.md`.
- Three integration scenarios in `test/integration/run.js` — `scenarioApiContractAuditPresent`, `scenarioInfraAuditPresent`, `scenarioComplianceAuditPresent` — plus a shared `assertSkillPresent()` helper. Each verifies tier pruning (absent on tier S), presence (SKILL.md + siblings on tier M/L), cheatsheet row presence, pipeline.md invocation, `allowed-tools` spec compliance, and body size budget. `scenarioApiContractAuditPresent` additionally verifies `hasApi: false` pruning; `scenarioComplianceAuditPresent` additionally verifies `PROFILES.md` scaffolds SOC 2 / HIPAA as future-markers.

### Changed

- `pipeline.md` Track B in tier-M/L renamed `Track B - API/DB audit` → `Track B - API/DB + compliance audit`, with `/api-contract-audit` and `/compliance-audit` added to the invocation list.
- `pipeline.md` Track C in tier-M/L renamed `Track C - Test + doc audit` → `Track C - Test + doc + infra audit`, with `/infra-audit` added to the invocation list.
- `README.md` skill count `17 audit skills` → `20 audit skills`; three rows added to the skills table; Current/Next roadmap rewritten; Testing section updated to `979 integration checks` and `332 unit tests`; shields.io badge updated to `979 checks`.
- `docs/operational-guide.md` audit-skill table updated with three new rows; Phase 5d Track B renamed "API/DB + compliance audit"; Phase 5d Track C renamed "Test + doc + infra audit"; three full skill detail sections added after `/doc-audit`.
- Integration test count: 895 → 979 (+84 across three scenario suites).
- `CLAUDE.md` line-count regression guard in `scenarioPlaceholderNoiseReduction` loosened from `< 85` to `< 90` to accommodate three additional Active Skills rows.
- `skill-registry.test.js` entry-count assertion updated from 19 to 22.

---

## [1.13.0] — 2026-04-24

### Added

- **New skill `/doc-audit`** (Issue #61, Tier M/L): static documentation drift audit. Seven checks:
  - **D1 Relative-link resolution**: markdown links to local files must resolve. `http(s)://` and anchors excluded.
  - **D2 Code-block syntax**: `json` / `yaml` / `toml` fenced blocks are parsed with a stack-appropriate tool (`node -e`, `python -c yaml.safe_load`, `python -c tomllib`). Blocks containing template markers (`<...>`, `{{...}}`, `[PLACEHOLDER]`) are skipped.
  - **D3 CDK placeholder residuals**: pinned list of the ten scaffold tokens — `[TEST_COMMAND]`, `[FRAMEWORK_VALUE]`, `[LANGUAGE_VALUE]`, `[INSTALL_COMMAND]`, `[DEV_COMMAND]`, `[BUILD_COMMAND]`, `[TYPE_CHECK_COMMAND]`, `[E2E_COMMAND]`, `[ENUM_CASE_CONVENTION]`, `[MIGRATION_COMMAND]`. Every token on the list is grepped against `packages/cli/templates/**` — only tokens the scaffold actually writes are included. Generic `[UPPERCASE]` regex is intentionally avoided.
  - **D4 Slash-command name match**: `/<skill>` mentions cross-verified against `.claude/skills/<skill>/`. CDK CLI verbs (`init`, `upgrade`, `doctor`, `add`, `new`) allowlisted.
  - **D5 Skill-count consistency**: numeric claims (`\d+ skills`) cross-verified against `.claude/skills/` minus `custom-*`.
  - **D6 ADR marker freshness**: if `[ADR_PATH]` set, frontmatter dates older than 180 days without a terminal `status:` flagged.
  - **D7 Stack-specific doc sync**: top-3 stacks only (`node-ts`, `python`, `swift`). Patterns live in a sibling `PATTERNS.md` — Next.js routes, Django URLconf paths, Swift Package.swift products. Other stacks skip D7.
- New skill directory scaffolded in `packages/cli/templates/tier-m/.claude/skills/doc-audit/` and `tier-l/.claude/skills/doc-audit/` (byte-identical across tiers): `SKILL.md` (271 body lines, inside the 500-line guardrail) + `PATTERNS.md` (agnostic D3 list + D7 stack-specific patterns).
- Registry entry in `skill-registry.js`: `minTier: 'm'`, `requires: {}` (universal), `cheatsheet: true`, `excludeNative: false`.
- Cheatsheet row for `/doc-audit` added in both Tier M and Tier L cheatsheet.md.
- Integration scenario `scenarioDocAuditPresent`: scaffolds tier-s/m/l and verifies SKILL.md + PATTERNS.md presence (or pruning on tier-s), cheatsheet row presence, pipeline.md Track C invocation, `allowed-tools` syntax spec-compliance, and SKILL.md body size budget.

### Changed

- `pipeline.md` Track C in both Tier M and Tier L renamed from `Track C - Test suite audit` to `Track C - Test + doc audit`, with `/doc-audit` invocation added alongside `/test-audit`.
- `README.md` skill count reference updated from `16 audit skills` to `17 audit skills`; `/doc-audit` row added to the skills table; Testing section updated to `895 integration checks` and `332 unit tests`; shields.io badge updated to `895 checks`.
- `docs/operational-guide.md` audit-skill table updated with a `/doc-audit` row (universal tier-M/L install, no `requires`); Phase 5d Track C renamed to "Test + doc audit"; full `/doc-audit` skill detail section added after `/test-audit`.
- Integration test count: 864 → 895 (+31 from `scenarioDocAuditPresent`).
- CLAUDE.md line-count regression guard in `scenarioPlaceholderNoiseReduction` loosened from `< 80` to `< 85` to accommodate the extra Active Skills row (one line per new skill in the registry). The guard still catches stripping regressions vs. the ~92-line raw template.
- `skill-registry.test.js` entry-count assertion updated from 18 to 19.

---

## [1.12.0] — 2026-04-24

### Added

- Five new `doctor` cross-file validation checks, all `warn:true` for user-facing scans (hard-fail only in CDK-internal integration tests):
  - `settings-no-placeholders`: flags unfilled `[UPPERCASE_TOKEN]` placeholders in `.claude/settings.json`.
  - `claudemd-stop-hook-test-cmd-match`: confirms the test command in the Stop hook appears in CLAUDE.md Key Commands. Handles both Tier S (`… && exit 0; CMD || echo`) and Tier M/L (`… && exit 0; cd $CLAUDE_PROJECT_DIR && CMD 2>&1 | tail`) hook shapes.
  - `claudemd-skills-directory-parity`: set-diffs `## Active Skills` in CLAUDE.md against `.claude/skills/` directory listing. `custom-*` skills excluded.
  - `pipeline-md-tier-coherence`: self-consistency check between the H1 of `pipeline.md` (Fast Lane / Tier M / Tier L) and the phase-section pattern (`FL-N` vs `Phase N` vs `Phase 1.6`).
  - `security-md-stack-alignment`: detects stack markers in the cwd (`Package.swift`, `build.gradle`, `Cargo.toml`, `go.mod`, `Gemfile`, `pom.xml`, `pyproject.toml`, `tsconfig.json`, `package.json`, `*.csproj`) and verifies `security.md` uses the expected variant (web / native-apple / native-android / systems) via H1 signature with content-marker fallback.
- New shared helper `packages/cli/src/utils/doctor-cross-file.js` with 9 functions (`parseActiveSkills`, `parseStopHookTestCmd`, `claudeMdContainsCommand`, `hasPlaceholder`, `detectPipelineTier`, `detectPhaseCountTier`, `detectSecurityVariant`, `expectedSecurityVariant`, `detectStackSync`). Sync-only companion to the async `detect-stack.js`.
- New unit test suite `test/unit/doctor-cross-file.test.js` — 30 cases covering the 9 helpers + edge cases (placeholder detection, YAML list vs scalar `allowed-tools` forms, H1 signature fallback).
- New integration scenario `scenarioDoctorCrossFileValidation` in `test/integration/run.js`: scaffolds tier-s/m/l, injects stack markers, and exercises both the happy path (all 5 checks pass/skip) and five corruption cases (one per check) that verify the expected drift is detected.

### Changed

- `doctor` runs **26 checks** total (was 21 post-v1.11.0, documented as 19 in stale README/operational-guide). v1.12.0 closes both the legacy doc drift and adds the 5 new checks.
- README check-count reference updated to `(26 checks)`.
- `docs/operational-guide.md` §Runs N checks refreshed to enumerate all 26 with Tier-0 skip note updated to "Checks 12-26".
- Integration test count: 834 → 864 (+30 from 6 assertions × 5 tier rows in `scenarioDoctorCrossFileValidation`).
- Unit test count: 302 → 332 (+30 from `doctor-cross-file` helper cases).

---

## [1.11.0] — 2026-04-24

### Fixed

- `allowed-tools` frontmatter syntax in `skill-review` tier-m/tier-l SKILL.md (`Read, Glob, Grep, Bash` → `Read Glob Grep Bash`). Anthropic spec documents space-separated string or YAML list; the comma-separated form is a scalar value with literal commas (`js-yaml` verified), which under a spec-conformant parser resolves to tool names that do not exist (`Read,`, `Glob,`, `Grep,`) and silently drops pre-authorisation. The remaining 39 SKILL.md were already compliant.
- `arch-audit` × 3 tier (tier-s/m/l) reduced from 508 to 360 body lines by extracting Step 3c (Prompting Guide P1–P5), Step 3d (token/subagent optimization T1–T5), and Step H1 (hook compliance H1a–H1f) into a sibling `advanced-checks.md` (173 lines, level 1 nesting per Anthropic spec). Closes Anthropic best-practice violation (≤ 500 lines) and CDK-C18 in `/arch-audit`.

### Added

- `doctor` check `skill-md-size-budget`: warns when any `.claude/skills/*/SKILL.md` body exceeds `SKILL_MD_MAX_LINES` (500, per Anthropic best practice).
- `doctor` check `skill-allowed-tools-syntax`: warns on comma-separated `allowed-tools` values, preventing regression of the v1.11.0 fix.
- Integration scenario `scenarioSkillMdSpecCompliance`: scaffolds tier-s/m/l and fails if any scaffolded SKILL.md exceeds 500 lines or uses comma syntax. Hard-fails as CDK-internal normative check (distinct from the user `doctor` check which only warns).
- `packages/cli/src/utils/skill-frontmatter.js` helper exposing `parseSkillFile`, `extractFields`, `countBodyLines`, `allowedToolsHasCommas`. Single regex-based YAML parser shared by `doctor`, `new-skill` validation, and integration tests.
- `SKILL_MD_MAX_LINES = 500` constant in `utils/constants.js` (threshold alignment with Anthropic best practice).
- 3 new `advanced-checks.md` reference files in `packages/cli/templates/tier-{s,m,l}/.claude/skills/arch-audit/` (byte-identical across tiers).
- Unit test suite `test/unit/skill-frontmatter.test.js` (10 new cases covering frontmatter parsing, body line counting, and comma detection edge cases).

### Changed

- `new-skill.js:validateSkillMd` migrated from inline regex frontmatter parsing to the shared `parseSkillFile` helper. Removes duplicate regex parser drift risk; behaviour preserved (unit tests unchanged).
- Integration test count: 828 → 834 (6 new checks from `scenarioSkillMdSpecCompliance`, 2 assertions × 3 tiers).
- Unit test count: 292 → 302 (10 new cases for `skill-frontmatter` helper).

---

## [1.10.4] — 2026-04-23

### Added

- Smoke test suite for `detect-stack.js` (20 tests across 2 describe blocks) covering stack identification markers for all 11 supported stacks (package.json ± tsconfig, pyproject.toml, go.mod, Gemfile, pom.xml, build.gradle.kts, build.gradle, Package.swift, .csproj, Cargo.toml) plus `suggestedTier` thresholds for the three calibrated brackets. Prerequisite coverage for the tier-threshold extraction below.

### Fixed

- CLI `--version` now reads from `package.json` at runtime (was hard-coded `1.6.1`, 4 releases of drift vs actual 1.10.3). Identified by `skill-dev` audit (J4).
- Wizard `AUDIT_MODELS` option list no longer offers `claude-opus-4-6` (Legacy per Anthropic models page); replaced with `claude-opus-4-7`. Fixes the root cause for the `operational-guide.md:166` doc drift below.
- `scaffold/index.js` `patchSettingsPermissions` no longer silently swallows malformed settings.json during stack-permission patching; it now logs a `console.warn` that names the file, the target stack, and the underlying error. Prevents scaffolds from shipping default JS/Node permissions on native stacks with no user-visible signal. Two new unit tests assert the warning is emitted and the file content is left unchanged.

### Changed

- `CONTRIBUTING.md` test counts refreshed to 828 integration + 270 unit (were 464/243, stale vs `README.md` and `CHANGELOG.md [1.10.3]`).
- `docs/operational-guide.md:166` wizard recommendation for deep-analysis model updated from `claude-opus-4-6` (Legacy per Anthropic models page) to `claude-opus-4-7`.
- `docs/operational-guide.md:43` + `:403` audit skill count aligned to 16 (was 15); added missing `skill-review` to the available-skills enumeration (added in v1.10.0, #58).
- Extracted three policy limits to named constants in `utils/constants.js`: `SKILL_DESC_MAX_CHARS` (250), `CLAUDE_MD_MAX_LINES` (200), `STOP_HOOK_MAX_TIMEOUT_SEC` (600). Removes magic numbers from `new-skill.js` and `doctor.js`.
- Consolidated `NATIVE_STACKS` usage: 7 inline literal arrays in `init-greenfield.js`, `init-in-place.js`, `scaffold/index.js` replaced with the canonical import from `skill-registry.js`. Added `WEB_STACKS` export in the same module and replaced 3 `webStacks` locals.
- Unified `STACK_CMD_DEFAULTS` (claude-md.js) and `stackCommandDefaults` (scaffold/index.js) into a single `STACK_COMMANDS` table in the new `utils/stack-commands.js` module. Install/dev/build/test values were byte-identical; `typeCheck` has two consumer-specific shapes (`typeCheck` for the CLAUDE.md commands block, `typeCheckPlaceholder` for `[TYPE_CHECK_COMMAND]` template interpolation).
- Extracted tier-suggestion thresholds into `utils/tier-suggestion.js`: 3 calibrated brackets (nodeWeb 100/30, medium 80/20, compact 60/15) plus `suggestTier(fileCount, thresholds)` helper. `detect-stack.js` 11 inline ternaries now delegate to the helper; values unchanged, single source of truth.

### Removed

- Unused `AUDIT_MODEL_DEFAULT` constant (0 consumers, confirmed via grep).
- `export` keyword on `scaffoldTier0`: it is only called internally from `scaffoldTier` and not listed in `_testHelpers`, so the public surface shrinks with no external impact.

---

## [1.10.3] — 2026-04-23

### Fixed

- arch-audit H1a grep pattern missed 15 hook events (StopFailure, PostToolUseFailure, SubagentStart/Stop, TaskCreated, PermissionRequest/Denied, TeammateIdle, SessionEnd, FileChanged, CwdChanged, ConfigChange, UserPromptExpansion, Elicitation/Result); would have falsely flagged StopFailure already in use.
- arch-audit C17 regex false-positive on arch-audit itself (self-referential `mcp__` in grep pattern); added skip-by-name + `^allowed-tools:` anchor.
- tier-l cheatsheet out of sync with skills dir: 5 skills missing (arch-audit, commit, context-review, dependency-scan, skill-review); restored to parity with tier-m + added context-review row (tier-l exclusive).
- tier-l settings.json hook `model: "claude-haiku-4-5"` undocumented short-form → alias `haiku` (matches 41 SKILL.md frontmatter convention).
- tier-s settings.json deny missing `Bash(git push origin main*)`; baseline main protection restored.
- tier-l settings.json deny missing `Bash(DROP TABLE*)`, `Bash(TRUNCATE*)`; regression vs tier-m.

### Updated

- arch-audit "new events worth adding" catalogue refreshed with 6 events (UserPromptExpansion, SessionEnd, TeammateIdle, TaskCreated, PostToolUseFailure, PermissionRequest) + note on new `type: "mcp_tool"` hook type (v2.1.118).
- claudemd-standards.md: hook events list v2.1.85 → v2.1.118 (22 → 27 events, `Last verified: 2026-04-23`).

### Unchanged

- No code changes in CLI source; template-only release. Integration 828/828, unit 270/270.

---

## [1.10.2] — 2026-04-19

### Fixed

- Cross-stack audit fixes (14 items from Node-TS + Python senior audits): NT-B1/B2, NT-T1-T5, PY-B1-B3, PY-T3/T4/T6/T7.
- Python, Go, Ruby now scaffold with stack-specific commands instead of npm fallbacks (PY-B1).
- `frameworkValue()` returns per-stack examples: FastAPI/Django/Flask for Python, Gin/Echo for Go, Rails/Sinatra for Ruby (NT-B1).
- Em-dash replaced with hyphen across all 107 template .md files per `output-style.md` rule (NT-B2).
- Phase 3b RLS generalized to "row-level access control (database-level RLS or application-level guards)" (NT-T3).

### Added

- 5 stack-conditional placeholders: `[VALIDATION_LIBRARIES]`, `[TEST_CLEANUP_PATTERN]`, `[COMMIT_EXAMPLES]`, `[BUILD_ARTIFACTS]`, `[ENVIRONMENT_SETUP]`.
- Python permissions extended: pytest, mypy, uvicorn, alembic in allow list; `alembic downgrade base` in deny (PY-B2/B3).
- Deny list hardening: `DROP DATABASE*` and `npm publish*` added to all tier settings.json (PY-T4).
- `SEC-` prefix added to severity handling in pipeline.md (NT-T5).
- `docs/sitemap.md` and `docs/db-map.md` added to files-guide.md "Loaded on demand" section.
- arch-audit skill aligned to Opus 4.7 (released April 16, 2026): new model IDs, retiring Claude 4.0 IDs, 4 new hook events, 5 new hook capabilities, settings awareness for `xhigh`/`autoMode`/`sandbox`.
- `.claude/rules/` and `.claude/settings.json` removed from git tracking (workspace config, not product).
- Unit tests: 270 (was 267). Integration checks: 828 (unchanged).

---

## [1.10.1] — 2026-04-18

### Fixed

- Native stack scaffolding gaps found via Swift validation: `swift run` default for GUI apps, `# not configured` in pipeline prose, dependency-scan `true is false` interpolation, staff-manager contamination, `Color.red` pilot example.
- Doctor command: timeout check at both outer and inner hook levels.
- Cheatsheet gap: 4 skills (responsive/visual/ux/ui-audit) now listed in cheatsheet templates with conditional pruning via `cheatsheet: true` in skill-registry.
- Tier-L template sync: 3 missing docs files (implementation-checklist, refactoring-backlog, requirements) copied from tier-M.
- Dead code: 7 orphan `replace()` calls removed from `interpolate()` (HAS_API, HAS_DATABASE, HAS_FRONTEND, HAS_E2E, AUDIT_MODEL, DESIGN_SYSTEM_NAME, HAS_PRD); no template contained these placeholders.

### Added

- `scripts/lint-templates.mjs` — static analysis: banned patterns, wizard placeholder coverage, tier M/L file sync. Zero warnings, zero false positives.
- Content assertion tests for 3 golden-file stacks: Swift (20 checks), Node-TS (22 checks), Python (22 checks).
- Cross-stack invariant tests: 10 stacks × 6 invariants = 60 assertions.
- Integration checks: 828 (was 536). Unit tests: 267 (was 281, 14 removed for dead code).
- 29 integration scenarios (was 27).

---

## [1.10.0] — 2026-04-17

### Added

- `/skill-review` skill (Tier M lite, Tier L full) — quality review pipeline for skill portfolios. Includes 5 supporting documents: REVIEW_FRAMEWORK.md, SEVERITY_SCALE.md, SPEC_SNAPSHOT.md, SKILLS_INVENTORY.md, CALIBRATION_KIT.md. Tier M skips Phase 4 (external LLM) and Phase 9 (midpoint drift). Tier L runs full pipeline.
- 19 reference files across 15 skills: PATTERNS.md (10), CHECKS.md (2), REPORT.md (6), DIMENSIONS.md (1); stack-scaffolded patterns separated from skill body logic.

### Changed

- Pipeline v2 body purity: all 17 SKILL.md files reworked; framework-specific patterns (grep commands, CSS utilities, Tailwind classes, SwiftUI literals) extracted from bodies into reference files. Bodies contain only universal principles. Net -2009 lines.
- Configuration sections added to security-audit (`[SITEMAP_OR_ROUTE_LIST]`), perf-audit (`[PERF_TOOL]`, `[PROFILER_COMMAND]`), skill-dev (`[LINT_COMMAND]`).
- skill-dev: scope filter for stack-specific check exclusion, refactoring-backlog.md fallback for missing file, D8 native stack clarification.
- Skill registry: 18 entries (added skill-review).
- `add skill` command: 18 skills available.
- Cross-validated by 4 LLMs (GPT-4.1, Gemini 2.5 Pro, Mistral Large, Sonar Pro) + 36 behavioral fixture cases across 6 high-risk skills.
- Integration checks: 536 (was 533).

---

## [Pre-1.10.0 development log] — targeted v1.9.1, shipped as part of v1.10.0

### Added

- `/test-audit` skill (Tier M/L, universal - no `requires`) - static test-suite quality audit. Parses coverage reports in 5 supported formats (lcov.info, Istanbul JSON, Cobertura XML, go coverage.out, tarpaulin JSON; xcresult optional via `xcrun xccov`). Pyramid shape classification (unit/integration/e2e) by path convention + framework imports. 8 anti-pattern checks (T1-T8): `.only`/`fit`/`fdescribe` committed, skipped tests, `.todo` placeholders, empty test bodies, tests without assertions, hardcoded sleeps, debug output in tests, multi-file `.only` broken CI. Backlog prefix `TEST-`. New Pipeline Phase 5d Track C runs for every block after Phase 3 is green. Critical findings (`.only` committed, 0% coverage on a file changed in the block) block Phase 6. Stack-aware across all 11 supported stacks; checks without a stack-specific pattern return `N/A - skipped for <stack>`. Flaky-test detection deferred; v1 is static-only (#58)
- `/accessibility-audit` skill (Tier M/L, `hasFrontend=true`) - unified accessibility surface. Three modes: `static` (A1-A8 grep patterns: aria-label on icon buttons, positive tabindex, outline-none regression, img alt, form labels, focus ring size, onClick on non-interactive, nav keyboard access); `full` (adds APCA contrast probes C1-C3 via Playwright, both themes); `wcag` (adds axe-core 4.9.1 scan with `wcag2a + wcag2aa + wcag21aa + wcag22aa` tags, plus `best-practice`). Backlog prefix `A11Y-`. Pipeline Phase 5d Track A execution order: `/ui-audit` (static, concurrent) → `/accessibility-audit` → `/visual-audit` → `/ux-audit` → `/responsive-audit` (#60)
- `/migration-audit` skill (Tier M/L, `hasDatabase=true`) - stack-aware static analysis of migration files. Detects Prisma, Drizzle, Supabase CLI, raw SQL; Rails/Django/Alembic/Flyway detected but pending support. 8 check families (M1-M8): lock-heavy DDL, missing rollback, unsafe backfills, constraint sequencing, data loss, unsafe type changes, unindexed FKs, ordering integrity. Backlog prefix `MIG-`. Pipeline Phase 5d Track B now runs `/migration-audit` when migrations are applied (#59)
- `new skill` command - interactive wizard to scaffold custom skills with valid frontmatter, test fixture, and CLAUDE.md registration (#55)
- `claudemd-update.js` shared utility - extracted CLAUDE.md Active Skills registration for reuse across commands
- `.github/drift-tracker/` - weekly GitHub Action that scrapes Anthropic docs for native features overlapping with CDK, opens `anthropic-drift` issues when overlap detected (#56)
- `add skill <name>` command - install a single skill without full scaffold (18 skills available)
- `add rule <name>` command - install a single rule with stack-specific security variants (`--stack swift|kotlin|rust|dotnet|java|go`)
- `custom-*` skill convention - user-created skills preserved across `upgrade` and `init` operations
- `docs/custom-skills.md` - SKILL.md authoring guide (frontmatter schema, model selection, body patterns)
- `skill-registry.js` - single source of truth for skill applicability rules (18 entries, 3 query functions)
- `.github/FUNDING.yml` - GitHub Sponsors enabled
- `.github/ISSUE_TEMPLATE/skill_request.md` - issue template for new skill requests (tier, stack, install condition)
- `.github/ISSUE_TEMPLATE/config.yml` - issue chooser; blank issues disabled, support redirected to Discussions Q&A
- `.github/workflows/discussion-monitor.yml` - weekly cron: finds unanswered Q&A discussions (>14 days), creates summary issue
- GitHub Project board populated with Q1-Q2 roadmap deliverables (14 issues across 2 milestones)
- Skill `description` field in all 18 SKILL.md frontmatter files (max 250 chars, used by Claude for auto-invocation)

### Fixed

- Hook `timeout` values corrected from milliseconds to seconds per Anthropic JSON schema (Tier M: 300000→300, Tier L: 600000→600)
- Doctor check #18 threshold corrected from 600000 to 600 (seconds, not milliseconds)
- Doctor check #18 fix message now suggests correct value (`"timeout": 300`)

### Changed

- `/ui-audit` scope narrowed to design-system compliance only. Extracted to `/accessibility-audit`: CHECK 11 (icon-only aria-label), CHECK 13 (positive tabindex), CHECK 14 (outline-none), CHECK 16 (img alt), CHECK 17 (form labels), S4 (nav keyboard), S6 (focus ring), S7 (onClick non-interactive), and Step 4 (axe-core WCAG scan). `/ui-audit` is now static-only (no Playwright). Check numbering preserves gaps to avoid breaking external references (#60)
- `/visual-audit` narrowed from 11 to 10 dimensions. V8 (Contrast & legibility) and APCA Lc anchors in V4 extracted to `/accessibility-audit` (C1-C3). Page score denominator changed from `/55` to `/50`; bucket thresholds recalibrated proportionally (Excellent ≥40 / Good 30-39 / Needs work 20-29 / Poor <20). Scoring rules updated: `Score 3 on V1/V3/V4/V9/V10 → Major` (V8 removed) (#60)
- `/skill-db` scope narrowed to live SQL verification (schema quality S1-S6 + N+1 query patterns Q1-Q3). Migration file analysis extracted to `/migration-audit` - single source of truth for migration safety across all database stacks. Pipeline Phase 5d Track B splits migration audit (`/migration-audit`) from schema audit (`/skill-db`). Affects projects invoking `/skill-db` for migration checks (#59)
- Agents converted to on-demand skills: `dependency-scanner` → `/dependency-scan`, `context-reviewer` → `/context-review`; eliminates `.claude/agents/` directory from all templates (#62)
- `pruneSkills()` rewritten from 37 to 5 lines (delegates to skill registry)
- `pruneCheatsheet()` rewritten from 15 to 9 lines (delegates to skill registry)
- `injectActiveSkills()` rewritten from 28 to 10 lines (delegates to skill registry)
- `NATIVE_STACKS` consolidated from 5 duplicate declarations to 1 export in skill-registry.js
- `FIRST_SESSION.md` moved from project root to `.claude/FIRST_SESSION.md` with auto-deletion in pipeline Phase 8
- Tier S file count reduced: 4 informational files skipped (files-guide, adr-template, pipeline-standards, claudemd-standards)
- Post-init message simplified from 5-6 steps to 2-3
- `upgrade` command now detects and reports custom skills as "preserved"
- `operational-guide.docs` renamed to `operational-guide.md`
- README rewritten in product-led style (badges, quick start, feature matrix, architecture diagram)
- CONTRIBUTING.md updated with skill registry workflow and `add` commands

### Fixed

- `responsive-audit` was not excluded for native stacks in `injectActiveSkills()` - CLAUDE.md listed it but the directory didn't exist for Swift/Kotlin/Rust projects
- Tier M pipeline Phase 8.5 referenced non-existent `context-reviewer` agent - changed to inline grep
- (CodeQL High) `init-in-place.js` incomplete URL substring sanitization - `remotes.includes('github.com')` replaced with regex domain match
- (CodeQL Medium) `add.test.js` shell injection risk - `execSync` template literal replaced with `execFileSync` + args array
- (CodeQL Medium) `review-wizard-output.js` no-op `.replace('─', '─')` removed
- (CodeQL Medium) `ci.yml` and `claude-dev-kit-verify.yml` missing `permissions:` blocks - added `contents: read` (least privilege)
- `security-audit` skill was gated on `hasApi: true` in skill registry - native apps (Swift, Kotlin, Rust) never received it despite having NS1-NS6 native security checks
- `arch-audit` SKILL.md description exceeded 250-char limit (255 chars) - trimmed to 211
- `doctor` now checks Stop hook timeout presence (check #18) and deny list duplicates (check #19)

### Evaluated (decisions documented, no code change)

- P5 Tier L: frozen - maintain functional, no new investment until real adoption signal
- P6 Agents: agent-to-skill conversion scheduled for next cycle (saves 27K tokens/session)
- P7 MCP: incremental adoption - GitHub MCP Q2, ecosystem reassessment Q4

---

## [1.0.0] — 2026-03-22

### Changed — Scope and positioning

- Primary target redefined: Builder PM and tech lead (people with enough technical background to work end-to-end with Claude Code). Not a generic "Product Trio."
- Tier boundaries reframed around blast radius and collaborator count, not file count or duration
- "Governance layer" positioning removed throughout; replaced with "scaffold for legible, reviewable AI-assisted development"
- CLI description, template files, pipeline criteria all updated to match

### Added — Enforcement layer

- `.github/workflows/claude-dev-kit-verify.yml` — CI template that verifies scaffold integrity on every PR (Stop hook configured, no unfilled placeholder, CLAUDE.md present, CODEOWNERS present)

### Added — `doctor` compliance reporting

- `--report` flag: machine-readable JSON output (`timestamp`, `cwd`, `summary`, per-check `status`/`fix`) consumable by CI pipelines and external audit systems
- `--ci` flag: silent mode, exits 1 on any failure — for GitHub Actions

---

## [0.5.3] — 2026-03-15

### Fixed — Critical

- Stop hook was missing from Tier S `settings.json`, breaking the core contract ("tests must pass in every tier"). Now enforced in all four tiers.

---

## [0.5.2] — 2026-03-10

### Added

- UAT scenario definition at scope gate: when Phase 4 E2E activates, the user must explicitly list numbered user journeys (1–5 scenarios) at Phase 1. Claude implements exactly those scenarios; it does not invent test cases.
- Phase 4 renamed "UAT / E2E tests" across Tier M/L pipelines.

---

## [0.5.1] — 2026-03-05

### Added

- Interactive tier selector: 3 diagnostic questions → auto-suggest tier with explanation
- Conditional Phase 4 E2E testing in Tier M/L (opt-in via init wizard, per-block scope gate confirmation)
- `doctor` now checks Stop hook for unfilled `[TEST_COMMAND]` placeholder (11th check)
- `FIRST_SESSION.md` scaffolded for Tier M/L — team guide to first block cycle

---

## [0.5.0] — 2026-02-20

### Added

- Session recovery (`.claude/session/`)
- Scope gate with Tier 1/2 EARS sweep auto-selection
- Interaction Protocol in CLAUDE.md templates
- Three new settings hooks: arch-audit reminder, InstructionsLoaded logging, PostCompact reminder
- Phase 8.5 mandatory closing message
- Phase 8 3-commit sequence
- Phase 5b/5c/5d block-scoped quality audits (Tier L)
- Structural Requirements Changes pipeline R1–R4 (Tier L)
- Fast Lane session file, escalation rule, scope-confirm gate
- C1–C11 context review with explicit grep commands
- Multi-agent orchestration: `dependency-scanner` (Tier M/L) and `context-reviewer` (Tier L)

---

## [0.1.0] — 2026-01-15

### Added

- Initial release: four-tier scaffold system (Discovery / Fast Lane / Standard / Full)
- Three init paths: Greenfield, From context, In-place
- `doctor` command with 10 checks
- `upgrade` command (non-destructive tier promotion)
- 9 audit skills for Tier M/L
- Pre-commit hooks, CODEOWNERS, PR template scaffolding
