# Test coverage strategy — shipped templates

**Date**: 2026-05-14
**Status**: Active (v1)
**Roadmap**: Q3 #12 / issue #138
**Owner**: maintainer

This document defines what CDK's test infrastructure does and does NOT cover for the templates shipped by the scaffolder (`packages/cli/templates/**`), the gaps surfaced by issue #138, and the chosen approach for each gap.

---

## 1. Surface under test

CDK ships three kinds of artifacts that reach the user's project after `npx claude-dev-kit init`:

1. **Pipeline rules** — `tier-{s,m,l}/.claude/rules/pipeline.md`. Normative prose that Claude Code reads each session to drive phase progression, gate behavior, and stop semantics.
2. **CLAUDE.md templates** — per-tier project context with wizard-filled placeholders.
3. **Skill bodies** — `skills/*/SKILL.md` files; covered separately by the skill-review pipeline (see `docs/reviews/2026-04-29-pipeline-meta/`).

This strategy covers items 1 and 2. Skill bodies are out of scope here.

---

## 2. Current coverage (baseline)

The integration suite (`packages/cli/test/integration/run.js`, 45 scenarios) covers:

- File presence after scaffold across all tier/mode combinations
- Frontmatter format conformance to SPEC_SNAPSHOT
- Cross-file scaffold consistency via `doctor` checks (skill ↔ CLAUDE.md ↔ settings.json)
- Wizard placeholder resolution in the scaffolded output (`assertNoUnfilledWizardPlaceholders`)
- Stop hook presence and resolved hook content
- Skill pruning and selective inclusion

Unit tests (`packages/cli/test/unit/*.test.js`) cover the scaffolder, generators, frontmatter parser, doctor logic, and detect-stack.

---

## 3. Gaps identified (issue #138)

### Gap 1 — Semantic accuracy of normative prose

No test verifies that the prose inside `rules/pipeline.md` (and equivalently `CLAUDE.md` template prose) is accurate, internally consistent, and agnostically applied. Replacing "use `data-*` selectors" with "use stable platform-appropriate selectors" is a semantic change with zero CI signal.

### Gap 2 — Cross-tier consistency on shared concepts

`tier-s`, `tier-m`, `tier-l` share concepts (STOP gate semantics, execution keywords, placeholder behavior, security checklist, Phase 5d Track A/B/C structure, severity handling, commit sequence). No test verifies these concepts stay aligned across tiers. Drift accumulates silently. Example surfaced during this work: `*(blocks touching >5 files or introducing new patterns)*` (tier-m) vs `*(blocks touching >5 files or new patterns)*` (tier-l).

### Gap 3 — Logic of gate clauses

Gate clauses (`*(if block adds/modifies API routes)*`, `*(if [E2E_COMMAND] configured)*`, `*(if project is a web or native UI application)*`) are the main mechanism for conditional stack-awareness. No test verifies they are visible, enumerable, or coherent across tiers.

### Gap 4 — Post-scaffold behavior

Tests verify what the wizard produces, not how Claude Code interprets the scaffolded `pipeline.md` in a real session. A prose change that makes "verify the build" ambiguous can cause Claude to skip the check in some projects with no CI signal.

---

## 4. Approaches mapped to gaps

The issue proposes seven approaches A–G tiered by ease. Mapping:

| Gap | Approaches addressing it | Selected for v1 |
|---|---|---|
| G1 — prose semantics | F (LLM-based eval) | Defer (rationale below) |
| G2 — cross-tier drift | A (lint), D (snapshot per stack) | A now, D roadmap |
| G3 — gate clause logic | B (enumeration), E (completeness) | B now, E roadmap |
| G4 — post-scaffold behavior | G (behavioral fixtures) | Defer (rationale below) |
| Adjacent — placeholder coverage | C (placeholder enumeration test) | C now |

### Decision per approach

**A — Cross-tier semantic lint (build now).** Declarative registry of concepts (`cross-tier-concepts.json`) mapped to tiers with explicit `matchType` per concept (`exact-text`, `section-presence`, `structural`). Lint walks each tier's pipeline.md and asserts every applicable concept matches its canonical form. Hard fail on drift. Registry is the load-bearing artifact: adding a new phase means updating the registry; the lint becomes mechanical.

**B — Gate clause enumeration (build now).** Script enumerates every gate clause in each tier and prints a per-tier inventory. Cross-tier delta report. **Scope is deliberately enumeration + report, not logic validation** — that's E.

**C — Placeholder enumeration (build now).** For every `[PLACEHOLDER]` referenced in `pipeline.md` template bodies, verify it is (1) in the wizard-managed list, (2) documented in `CLAUDE.md` template, or (3) explicitly listed as user-fill (role names, state names). Complement to issue #134 placeholder meta-rule. Distinct from `assertNoUnfilledWizardPlaceholders` (which operates on post-wizard output).

**D — Snapshot tests per representative stack (roadmap).** Fixture project per stack target (web, backend Python, Go CLI, Swift iOS, Rust crate). Scaffold CDK in each, snapshot the output, diff on PR. Captures cross-tier divergence and post-scaffold behavior at file level. Cost: ~1 week initial + recurring per new stack. To file as a separate issue once A+B+C are in production for at least one release cycle.

**E — Gate matrix completeness (roadmap).** Builds on B. For each gate, verify matrix completeness across stack targets. Detects gates that leave legitimate stacks uncovered. Requires explicit enumeration of target stacks. To file as a separate issue after B has surfaced any concrete completeness questions.

**F — LLM-based prose semantic eval (defer).** Rationale: (1) cost — would run per-PR touching templates, not on-demand; (2) non-determinism — same prose can score differently across runs; (3) Phase 6 cross-LLM of the skill-review pipeline already exercises this pattern on-demand for the same surface. The marginal value of converting it to a per-PR gate is unclear until B/E reveal what semantic checks are actually missed by mechanical lint. Re-evaluate when A/B/C have been in production for two release cycles and a recurring class of drift escapes them.

**G — Behavioral fixture testing (defer).** Rationale: weeks of setup, recurring per new stack/skill, non-trivial runtime cost. Conceptually the strongest test but the failure mode it catches (Claude interprets prose differently across runs) is also the hardest to assert against. Re-evaluate when CDK has paying customers whose deployments depend on phase semantics.

---

## 5. Sequencing rationale

**v1 (this PR, issue #138)**: A + B + C, hard-fail integration in `run.js`. Aligns with acceptance literal. Registry tight by design: only concepts the maintainer can defend right now go in; growth is incremental per release.

**v2 (separate issues)**: D + E.

**Deferred indefinitely**: F + G. Reopen with explicit re-evaluation criteria stated above.

The defensible position: mechanical checks catch the regressions that are cheap to catch, the document of what's NOT covered makes the residual risk visible to anyone changing templates, and on-demand cross-LLM review handles the rest when it matters.

---

## 6. Drift decision — tier-m vs tier-l Phase 1.5

The drift `*(blocks touching >5 files or introducing new patterns)*` (tier-m) vs `*(blocks touching >5 files or new patterns)*` (tier-l) is semantically negligible but functionally a real cross-tier inconsistency.

**Decision**: align tier-m to tier-l canonical form `*(blocks touching >5 files or new patterns)*`. Rationale: tier-l is the more mature, curated tier and serves as canonical reference; tier-m derives from it.

Applied in this PR. Registry encodes the canonical form so future drift is caught.

---

## 7. Concept registry — first cut (v1)

The registry lives in `packages/cli/test/template-coverage/cross-tier-concepts.json` and is consumed by the A lint. v1 contains only concepts the maintainer can defend as aligned-required *today* — additions go through a registry-update PR, not silent expansion.

Concepts in v1:

1. **Placeholder behavior section** — exact-text match for the 4-line normative paragraph. Applies to all 3 tiers.
2. **Execution keywords** — exact-text match for `` `Execute` · `Proceed` · `Confirmed` · `Go ahead` ``. Applies to all 3 tiers.
3. **Never commit to main/staging** — section-presence in Cross-cutting rules. Applies to all 3 tiers.
4. **Secret hygiene** — section-presence in Cross-cutting rules. Applies to all 3 tiers.
5. **Phase 1.5 Design review heading** — exact-text. Applies to tier-m and tier-l only. Canonical form: `## Phase 1.5 - Design review *(blocks touching >5 files or new patterns)*`.
6. **Phase 5d Track A/B/C structure** — structural (three tracks must be present with their heading lines). Applies to tier-m and tier-l only.
7. **Security checklist five items** — structural (5 ordered conditional items, plus the fallback "If none apply"). Applies to tier-m and tier-l only.
8. **Phase 8 commit sequence three commits** — structural (Commit 1 source / Commit 2 docs / Commit 3 context). Applies to tier-m and tier-l only.
9. **Severity handling Critical/Major/Minor** — section-presence in Phase 5d. Applies to tier-m and tier-l only.
10. **Phase 6 STOP gate present** — section-presence. Applies to tier-m and tier-l only.

Explicitly may-diverge (NOT in registry):

- FL-N (tier-s) vs Phase-N (tier-m / tier-l) numbering scheme
- Phase 1.6 Visual & UX Design (tier-l only — mandatory by design)
- Plan lock + context reset section (tier-l only)
- Pipeline for Structural Requirements Changes (tier-l only)
- ADR write step in Phase 8 (tier-l only)
- Phase 8.5 delegation (tier-m runs C1–C3 inline, tier-l delegates to `/context-review` skill)

---

## 8. Integration in run.js

Three new scenarios:

- `scenarioCrossTierLint` — invokes `cross-tier-lint.mjs`, asserts zero violations against registry.
- `scenarioGateEnumeration` — invokes `gate-enum.mjs`, asserts the inventory generates without errors and the report is non-empty per tier.
- `scenarioPlaceholderCoverage` — invokes `placeholder-check.mjs`, asserts every template-referenced placeholder is documented or wizard-managed.

All three hard-fail on violation, consistent with the existing `failures` collector pattern. Scripts are also standalone-invokable for local development (`node packages/cli/test/template-coverage/cross-tier-lint.mjs`).

---

## 9. Acceptance check against #138

- [x] Design document at `docs/architecture/test-coverage-strategy.md` — this file.
- [x] Implementation of A + B + C — see `packages/cli/test/template-coverage/`.
- [x] Roadmap for D + E — to be filed as separate GitHub issues at PR merge.
- [x] Explicit decision on F + G — defer, re-evaluation criteria stated.
- [x] Integration in `run.js` with hard-fail CI gating.

---

## 10. Maintenance contract

When adding a new phase or modifying normative prose in any `pipeline.md`:

1. If the concept must remain aligned cross-tier — add or update the corresponding entry in `cross-tier-concepts.json` *before* changing the templates. The lint will fail until both sides match.
2. If the concept is may-diverge — append to the "may-diverge" list in §7 with a one-line rationale.
3. If unsure — default to aligned-required. Cost of adding a registry entry is low; cost of unnoticed drift is high.

When adding a new stack target:

1. Verify gate clauses enumerated by B cover the new stack. Gaps go in issue tracker as candidates for E (gate matrix completeness).
