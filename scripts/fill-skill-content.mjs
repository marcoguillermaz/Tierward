#!/usr/bin/env node
// One-shot script: fills in "Dove e quando" and "Output atteso" sections
// in generated skill registry pages. Replaces <!-- TODO --> placeholders.
// Safe to re-run: only touches lines between the section header and the
// next ## header or end of file.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUTPUT_DIR = resolve(ROOT, 'site/skills');

const CONTENT = {
  "arch-audit": {
    "dove_e_quando": "Run this after upgrading Claude Code, after Anthropic releases new documentation, or before a major release to confirm that CLAUDE.md and plugin.json are not using deprecated patterns. Useful for any maintainer who needs confidence that the project's context system matches current platform expectations.",
    "output_atteso": "A structured report listing each architecture file checked, with PASS/WARN/FAIL status per item. Auto-fixes are applied directly when a safe substitution exists. A typical finding: a deprecated model ID in settings.json replaced with its current alias."
  },
  "security-audit": {
    "dove_e_quando": "Run before any release, or after adding authentication, new API routes, or database access. The 3-path dispatch (WEB/NATIVE/HYBRID) means the audit only checks patterns relevant to the actual stack, so it stays focused without manual scoping. Security engineers and solo developers alike benefit before merging user-facing changes.",
    "output_atteso": "A severity-tiered report (Critical / High / Medium / Low) covering auth gaps, missing input validation, RLS misconfigurations, and known CVEs pulled live via the mcp-nvd server when available. A typical finding: an API route missing authentication middleware, with the exact file path and suggested fix."
  },
  "perf-audit": {
    "dove_e_quando": "Run when a build starts slowing, a PR adds new async data fetching, or a Lighthouse score drops. The 8-stack pattern library covers common frameworks, so it catches serial awaits and unoptimized queries that code review typically misses.",
    "output_atteso": "A categorized report grouped by bundle size, async efficiency, and query patterns, each finding annotated with estimated impact. A typical finding: three sequential awaits inside a request handler flagged as parallelizable with Promise.all, with the refactored snippet shown."
  },
  "skill-dev": {
    "dove_e_quando": "Run during a codebase health check or before a major refactor to understand where technical debt is concentrated. The churn-times-debt hotspot matrix surfaces files that are both frequently changed and poorly structured, so effort goes where it has the most impact.",
    "output_atteso": "A top-10 hotspot matrix with file path, churn score, debt score, and a short description of the dominant issue. Additional sections cover coupling, dead code, and TypeScript safety gaps. A typical finding: a utility module with high churn, multiple `any` annotations, and three unused exports."
  },
  "simplify": {
    "dove_e_quando": "Run after a feature is working and tests pass, or when code review feedback mentions complexity or excessive nesting. It targets logic structure rather than bugs, so it pairs well with `/code-review` rather than replacing it.",
    "output_atteso": "Direct edits applied to source files: early returns replacing nested conditionals, dead branches removed, redundant variables collapsed. The diff is the output. A typical change: a five-level nested if-else replaced with a guard-clause chain."
  },
  "commit": {
    "dove_e_quando": "Run after staging changes when you want a Conventional Commits-compliant message without writing it manually. It reads the diff, infers the type and scope, and executes the commit — removing the friction of switching context to think about commit semantics mid-implementation.",
    "output_atteso": "A single git commit executed with a `type(scope): description` message derived from the staged diff. No report is produced. A typical output: `feat(cli): add --dry-run flag to deploy command`."
  },
  "skill-security": {
    "dove_e_quando": "Run before publishing or distributing any Claude Code skill, especially those that invoke MCP tools or accept user-provided arguments. The 64-pattern SkillSpector scanner catches prompt injection vectors and supply-chain risks that standard code review does not check.",
    "output_atteso": "A structured report listing each matched pattern with category (prompt injection / data exfiltration / MCP tool poisoning / supply chain), severity, file location, and remediation guidance. A typical finding: a skill that echoes unsanitized user input directly into a shell command."
  },
  "systematic-debugging": {
    "dove_e_quando": "Run when a bug's root cause is unclear and the temptation is to apply a speculative fix. The STOP gate between hypothesis and fix prevents patch-on-patch cycles and is especially valuable for flaky tests, race conditions, and multi-system failures.",
    "output_atteso": "A structured investigation log with observations, ranked hypotheses, the confirmed root cause, and a proposed fix. The fix is not applied until the STOP gate is explicitly cleared. A typical output: a confirmed nil-pointer path through three middleware layers, with the exact line that needs guarding."
  },
  "api-design": {
    "dove_e_quando": "Run when designing new API endpoints or reviewing an existing surface before it becomes a public contract. Teams building client integrations benefit most, since naming inconsistencies and missing pagination are far cheaper to fix before consumers exist.",
    "output_atteso": "A structured review covering URL naming, HTTP verb correctness, response envelope consistency, and pagination completeness. Each finding is rated by impact and includes a corrected example. A typical finding: a POST endpoint returning 200 instead of 201 with no Location header."
  },
  "skill-db": {
    "dove_e_quando": "Run before merging schema changes or after a query starts appearing in slow-query logs. It covers normalization issues, missing indexes, N+1 patterns in ORM usage, and RLS policy gaps that query-level profiling does not surface.",
    "output_atteso": "A report grouped by category (schema, indexes, query patterns, RLS) with severity and file or migration reference per finding. A typical finding: a many-to-many join table missing a composite unique index, with the exact migration snippet needed to add it."
  },
  "migration-audit": {
    "dove_e_quando": "Run every time a database migration is written, before it is merged or applied to staging. Lock-heavy DDL and irreversible column drops are among the highest-risk changes in any deployment — this audit is the last gate before they touch production data.",
    "output_atteso": "A severity-tagged report per migration file covering data-loss risk, rollback feasibility, and lock duration estimates for the detected ORM or SQL dialect. A typical finding: an ALTER TABLE ADD COLUMN NOT NULL without a default on a large table, flagged as a table lock that will block writes during deployment."
  },
  "visual-audit": {
    "dove_e_quando": "Run after implementing a new UI section or before a design review, to catch low-level polish issues without a full design handoff. It closes the gap between implementation and the intended visual system, useful for both designers reviewing output and developers self-reviewing before sharing.",
    "output_atteso": "A structured report covering typography scale, spacing consistency, visual hierarchy, dark mode correctness, and micro-polish items. Each finding references the component or CSS class involved. A typical finding: a heading using a raw pixel value instead of the design token for h2 font size."
  },
  "ux-audit": {
    "dove_e_quando": "Run before a usability review or after user feedback indicates confusion with a flow. It applies ISO 9241-11 and Nielsen heuristics systematically, which is useful when there is no UX researcher available to conduct a formal evaluation.",
    "output_atteso": "A heuristic-tagged report with findings ordered by impact on user confidence and task completion. Each finding includes the violated principle, the affected interaction, and a concrete recommendation. A typical finding: a destructive action with no confirmation dialog, violating the error prevention heuristic."
  },
  "responsive-audit": {
    "dove_e_quando": "Run after adding a new layout or component that will be used on mobile, or when QA reports breakage on small screens. It covers the full 320-1024px range and checks WCAG tap target sizes, which manual testing at a single viewport often misses.",
    "output_atteso": "A viewport-by-viewport report listing layout breakage, elements with tap targets below 44x44px, and WCAG failures. Each finding includes the breakpoint, selector, and measured value. A typical finding: a navigation link at 320px with a 28px tap target and overlapping adjacent text."
  },
  "ui-audit": {
    "dove_e_quando": "Run when integrating a design system into a codebase for the first time, or after a sprint that added multiple new components, to ensure design token usage is consistent and available components are not being reimplemented. Particularly useful in teams with mixed design-system familiarity.",
    "output_atteso": "A report covering token compliance, component adoption gaps, and missing empty or error states. Each finding links to the relevant component or token. A typical finding: a custom dropdown implementation in three files where the design system already provides one with the same API."
  },
  "accessibility-audit": {
    "dove_e_quando": "Run before any public release or after significant UI changes, especially when adding forms, modals, or interactive widgets. Static analysis via aria, tabindex, focus, and label checks catches the majority of screen-reader and keyboard-navigation failures without requiring a browser session.",
    "output_atteso": "A WCAG 2.2 conformance report with findings grouped by success criterion, each tagged with impact level (critical / serious / moderate / minor). APCA contrast failures include the measured ratio and the required minimum. A typical finding: an icon button with no accessible label, rated critical for screen-reader users."
  },
  "test-audit": {
    "dove_e_quando": "Run when coverage reports look healthy but confidence in the test suite is low, or before a refactor to understand which areas have no safety net. The anti-pattern detection catches `.only` leaks, skipped tests, and assertion-free tests that inflate coverage metrics without providing real protection.",
    "output_atteso": "A report with overall coverage by layer, pyramid shape assessment (unit / integration / e2e ratio), and a list of anti-pattern instances with file and line number. A typical finding: twelve test files with no assertions that contribute 8% to the reported line coverage while providing zero protection."
  },
  "doc-audit": {
    "dove_e_quando": "Run after refactoring commands, renaming skills, or cutting a major version, to verify that documentation stays consistent with the actual codebase. It prevents the common drift where code evolves but guides, READMEs, and ADRs still reference old names or defunct paths.",
    "output_atteso": "A structured report listing broken links, code blocks with invalid syntax, stale skill or command names, unreplaced Tierward placeholders, and ADRs older than the configured freshness threshold. A typical finding: five slash-command references in a guide pointing to skill names that were renamed in the last release."
  },
  "api-contract-audit": {
    "dove_e_quando": "Run before merging a PR that changes any API handler, or after auto-generating a new OpenAPI spec, to confirm the spec matches the implementation and no breaking changes are introduced for existing consumers. Richardson Maturity scoring gives a quick read on API quality without a full review.",
    "output_atteso": "A drift report listing endpoints present in code but absent from the spec, breaking changes flagged by type (removed field, changed type, new required parameter), and an overall Richardson Maturity level from L0 to L3. A typical finding: a required query parameter added to an existing endpoint without a corresponding spec update."
  },
  "infra-audit": {
    "dove_e_quando": "Run before merging infrastructure changes to GitHub Actions workflows, Dockerfiles, Kubernetes manifests, or Terraform modules. Stack-agnostic, it covers patterns that application-layer security reviews miss, such as overprivileged IAM roles and unpinned action versions.",
    "output_atteso": "A severity-tagged report grouped by infrastructure layer with specific file paths and line numbers. A typical finding: a GitHub Actions workflow using `actions/checkout@v3` without a pinned SHA, flagged as a supply-chain risk with the recommended pinned reference shown."
  },
  "compliance-audit": {
    "dove_e_quando": "Run before a compliance review, when onboarding a new data category, or when legal requests a GDPR readiness assessment. The GDPR profile is the default target; SOC 2 and HIPAA scaffolds are available when the project scope requires them.",
    "output_atteso": "A compliance gap report covering identified PII fields, missing data-subject rights handlers, consent management gaps, encryption-at-rest status, retention policy coverage, and undocumented sub-processors. A typical finding: a user email stored in an analytics event log with no documented retention policy or deletion pathway."
  },
  "dependency-audit": {
    "dove_e_quando": "Run on a regular cadence (weekly or before a release) to identify outdated dependencies and understand the risk of upgrading. The Tier A/B/C classification lets teams batch safe upgrades automatically while reviewing breaking-change candidates manually.",
    "output_atteso": "A tiered dependency report: Tier A (patch and minor, safe to batch), Tier B (major, non-core), and Tier C (major, core or high breaking-change risk). Each entry includes current and latest version, and changelog highlights. A typical Tier C finding: a major ORM upgrade with breaking query API changes affecting fifteen files."
  },
  "pr-review": {
    "dove_e_quando": "Run after pushing a branch and opening a PR, or on any PR awaiting review when human reviewer bandwidth is limited. The `--deep` flag escalates analysis to Opus for PRs with complex logic changes, migrations, or security-sensitive code.",
    "output_atteso": "Findings posted as a PR comment via the gh CLI, grouped by severity with file links and line references. A typical comment: a missing null check on an optional field that is accessed before validation, with the exact line flagged and a suggested guard clause."
  },
  "skill-review": {
    "dove_e_quando": "Run when adding new skills to a portfolio or after editing multiple existing ones, to verify each skill meets the spec and that tiers are coherent across the set. It catches cross-skill inconsistencies that per-skill checks miss, such as conflicting model assignments or missing behavioral fixtures.",
    "output_atteso": "A compliance matrix per skill covering spec fields, tier assignments, model correctness, and fixture coverage, with a cross-portfolio coherence summary. A typical finding: two skills in the same tier using different model defaults for an identical task profile."
  },
  "dependency-scan": {
    "dove_e_quando": "Auto-invoked at Phase 1 of the Tier M and Tier L pipelines. It rarely needs manual invocation; its purpose is to give downstream pipeline phases a verified file list before any edits begin. Run it manually only when restarting a pipeline from Phase 1 after an interruption.",
    "output_atteso": "A structured file manifest listing routes, components, shared types, and database tables relevant to the task scope. The output feeds the Phase 1 STOP gate directly. A typical output: 14 files across 3 layers with dependency edges annotated for the phases that follow."
  },
  "context-review": {
    "dove_e_quando": "Auto-invoked at Phase 8.5 of the Tier L pipeline after a block closes, to recompact CLAUDE.md and detect context drift before the next block begins. Manual invocation is only needed when a Tier L session is interrupted and must be resumed mid-pipeline.",
    "output_atteso": "A recompacted CLAUDE.md written in place, plus a short drift report listing stale context blocks, outdated task references, or duplicate entries removed. A typical finding: a completed task block still marked active, removed to keep the active context accurate for subsequent phases."
  }
};

let updated = 0;
for (const [skill, { dove_e_quando, output_atteso }] of Object.entries(CONTENT)) {
  const path = resolve(OUTPUT_DIR, `${skill}.md`);
  let content = readFileSync(path, 'utf8');

  content = content
    .replace(
      /## Dove e quando\n\n<!-- TODO[^>]*-->/,
      `## Dove e quando\n\n${dove_e_quando}`
    )
    .replace(
      /## Output atteso\n\n<!-- TODO[^>]*-->/,
      `## Output atteso\n\n${output_atteso}`
    );

  writeFileSync(path, content, 'utf8');
  updated++;
}

console.log(`Filled ${updated} skill pages.`);
