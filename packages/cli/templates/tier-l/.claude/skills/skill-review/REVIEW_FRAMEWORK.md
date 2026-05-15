# Skills Quality Review Framework

**Version**: 1.3
**Created**: 2026-04-14
**Updated**: 2026-05-01 - P2 mechanical checks from 2026-04-29 cross-LLM meta-review: Phase 1 checks 7+8 (architectural/paradigm vocab scan + reference file coverage), Phase 2.A(e) test-runner idiom expansion.
**Status**: Consolidated - ready for execution once pre-work artifacts P1-P5 are produced.

**Purpose**: single source of truth for the quality review of all 18 CDK skills. Replaces any prior partial framework. Every check, decision point, and severity level lives here.

---

## Scope

The review validates each SKILL.md in `packages/cli/templates/tier-*/.claude/skills/` against:

1. **Anthropic spec compliance** - conforms to documented frontmatter and body structure.
2. **CDK scope alignment** - stack-agnostic, registry-coherent, pipeline-integrated.
3. **Internal quality** - checks are universal, severity calibrated, report template matches body.
4. **Cross-skill coherence** - references accurate, boundaries don't overlap, boilerplate intentional.
5. **Behavioral correctness** *(added v1.2)* - skills behave correctly when executed, not only when read. Validated via targeted behavioral fixtures on high-risk skills.
6. **External validation** - LLM cross-model review as recall booster (not verdict).

**Out of scope**: skill runtime performance, user preference.

---

## Severity scale - FINDINGS (review-time)

Classifies findings produced BY this review against each skill. Review-layer scale.

| Severity | Pipeline action | Examples |
|---|---|---|
| Critical | Fix before moving to next phase | Non-documented frontmatter field, placeholder unresolved at runtime, tool-instruction mismatch |
| High | Fix before Phase 6 (GO) | Pipeline↔skill misalignment, project artifact in skill body, cross-skill reference to non-existent skill |
| Medium | Fix or register roadmap with explicit decision | Boilerplate drift, model↔complexity suboptimal, Anthropic compliance opportunity missed |
| Low | Register roadmap, ignore, or fix if trivial | Minor token inefficiency, cosmetic drift |

### Severity mapping - review ↔ runtime (C5 patched)

Two scales coexist:

- **Review scale** (above): applied to findings DURING the review of a skill.
- **Runtime scale** (P2, used by skills themselves): applied by each skill at runtime to issues it detects in a user project.

**Operational definition of "aligned"**: two scales are aligned iff (a) they use identical labels Critical/High/Medium/Low AND (b) each label is defined by a criterion that is shared across both scales (severity of consequence + reversibility + scope).

**Fix-routing rule (revised)**:
- Miscalibration found in **1 skill**: fix at skill level (relabel the runtime severity).
- Miscalibration pattern found in **≥2 skills for the same check type**: framework defect. Fix the P2 scale itself, then re-apply to affected skills.

This supersedes the earlier "fix at skill level, not framework level" rule, which failed when the miscalibration was caused by a broad framework principle (Gemini §4 fallacy).

### User-pain dimensions on runtime scale (C5 addition)

The runtime severity scale (P2) is calibrated primarily on the target user's pain, not only on governance contamination. Each level must account for:

- **False-positive rate**: how often the check fires when nothing is wrong.
- **Actionability**: whether the user knows what to do with the finding.
- **Remediation clarity**: whether the fix path is obvious.
- **Invocation context**: whether the skill is clearly the right tool for the user's current task.

A check with high FP rate or low actionability cannot be labeled Critical even if the technical severity is high - the effective user impact is degraded.

---

## Pre-work (once, before skill #1)

Five artifacts must exist before any skill review begins. Build in sequence with STOP gate after each.

### P1 - Anthropic spec compliance checklist

**File**: `docs/reviews/skills-quality-review/anthropic-spec-checklist.md`
**Purpose**: actionable checklist with binary PASS/FAIL criteria for Phase 1 mechanical preflight.
**Content**: C1-C9 checks (required fields, documented-only fields, value validation, field combinations, body size, progressive disclosure trigger, placeholder resolution, runtime substitutions, dynamic injection).
**Status**: Created 2026-04-14.

### P2 - Severity reference scale (domain-neutral)

**File**: `SEVERITY_SCALE.md` (bundled with skill-review for export)
**Purpose**: reference scale that skills use to classify runtime findings. Domain-neutral (UI, security, API, testing, migration, accessibility).
**Content**: Critical/High/Medium/Low with criteria + user-pain dimensions (see above) + pipeline action mapping.
**Status**: Pending.

### P3 - Canonical skills inventory

**File**: `docs/reviews/skills-quality-review/skills-inventory.md`
**Purpose**: reference table of all 18 skills with metadata. Enables cross-skill checks, conditional Phase 4 gating, stable baseline.
**Content**: name, tier, line count, model, allowed-tools, registry flags, placeholder list, subagent usage, effort field presence, supporting files, behavioral-fixture target (yes/no per D1), pre-existing LLM review (yes/no per O2).
**Coverage check (T2.6)**: every skill under `packages/cli/templates/*/skills/` must have a P3 row. Missing rows block cycle start.
**Status**: Pending.

### P4 - Anthropic spec snapshot (one-shot)

**File**: `ANTHROPIC_SNAPSHOT.md` (bundled with skill-review for export)
**Purpose**: immutable reference snapshot of Anthropic skill documentation for the entire review cycle.
**Content**: source URLs, fetch date, full frontmatter spec, structural recommendations, compaction budget, substitution variables, dynamic injection syntax.
**Spec-change protocol**: if Anthropic doc changes mid-cycle, P4 regenerated + Phase 1 C1-C8 re-run on all prior skills. Treated as emerging principle under the freeze rule (see Retroactive re-application).
**Status**: Pending.

### P5 - Reviewer calibration kit *(new v1.2)*

**File**: `CALIBRATION_KIT.md` (bundled with skill-review for export)
**Purpose**: reduce reviewer judgment drift across the 40+ hour cycle.
**Content**:
- **Calibration set**: 2-3 historical findings with known severity, read before skill #1. Example: `Color.red` misclassification = Critical (project artifact + behavioral FP).
- **Anchor catalog**: 10-15 canonical examples covering Critical/High/Medium/Low across domains (UI, API, security, docs).
- **Drift indicators**: checklist of self-diagnostic questions to re-read at Phase 9 (midpoint).
**Status**: Pending.

**Sequential STOP gate**: after each artifact, user reviews and confirms before proceeding to the next.

---

## Cross-tier variations (multi-tier skills)

Multiple skills exist in parallel tier-s/tier-m/tier-l variants (arch-audit ×3, security-audit ×3). Rules:

1. **Inventory** (P3): each tier variant is a distinct row.
2. **Review order**: all variants of a skill-family reviewed in the same session. Order: tier-s → tier-m → tier-l (small to large surface). Findings on tier-s may propagate to tier-m/tier-l where identical.
3. **Cross-tier consistency check** (Phase 2.B, check 7): diff current variant against siblings.
4. **Expected-delta taxonomy (C6)**:
   - **Expected deltas**: scope (more checks in higher tier), verbosity (more examples in higher tier), tool-set (heavier tools allowed in higher tier).
   - **Unexpected deltas**: frontmatter drift, allowed-tools mismatch for same capability, severity label drift for same check, description divergence for same purpose, report-template drift without reason.
5. **STOP gate at end of Phase 2.D (C6)**: user reviews cross-tier diff artifact (column-by-column table) and approves propagation strategy BEFORE Phase 3 fixes execute.
6. **Phase 6 GO**: only after ALL variants of a multi-tier skill are green. No partial close.

---

## Retroactive re-application of emerging principles *(freezed per C3)*

During review, new universal principles may emerge that were not in the framework at start. Handling with bounded freeze rule:

### Entry criteria (new principle enters current cycle only if)

A new check qualifies for in-cycle retroactive application iff at least ONE holds:
- **(a) External spec change**: Anthropic documentation changed mid-cycle.
- **(b) Observed in ≥2 skills**: same defect pattern independently surfaced on multiple skills.
- **(c) Plausibly Critical at runtime**: the principle, if violated, would cause a Critical runtime failure in user projects.

Principles that do not meet (a), (b), or (c) are logged to `vNext-principles.md` and applied in a future review cycle.

### Hard cutoff

After skill #12 (of 17), only Criticals under rule (c) enter current cycle. All other emerging principles roll to vNext. This guarantees the cycle converges.

### Steps

1. **Capture**: codify as framework amendment (new check in appropriate phase).
2. **Memory persistence**: save to auto-memory type `feedback` with skill that surfaced it and reason.
3. **Retroactive application**: re-run new check against all previously reviewed skills (1..N-1). Bounded mechanical pass.
4. **Framework version bump**: append one-line changelog entry.
5. **Inventory update**: mark retroactively fixed skills as "re-reviewed: YYYY-MM-DD (principle X)".

---

## Per-skill pipeline

Six phases per skill + Phase 9 midpoint (mid-cycle) + Phase 10 final mechanical sweep (cycle closure).

### Phase 1 - Mechanical preflight

**Executor**: Claude (no user interaction)
**Input**: single SKILL.md + P1 checklist
**Output**: list of Critical/High findings for Phase 3

Checks:
1. **Anthropic spec compliance** - apply P1 C1-C8 to frontmatter and body.
2. **Line count ≤ 500** - `wc -l`. If > 300, trigger progressive disclosure evaluation in Phase 2.C.
3. **Registry↔body coherence** - verify `requires`/`excludeNative`/`minTier`/`cheatsheet` in `skill-registry.js` match body.
4. **Allowed-tools↔body instructions** - grep body for capability keywords, cross-reference declared tools.
5. **Placeholder resolution** - every `[PLACEHOLDER]` handled by `interpolate()` or documented as user-fill.
6. **Model↔complexity alignment** - heuristic: line count + subagent usage + judgment steps.
7. **Architectural + paradigm vocabulary scan (forms 4+5)** - grep SKILL.md body for unguarded occurrences of:
   - Form 4 (architectural): `layer`, `MVC`, `hexagonal`, `microservice`, `monolith`, `repository pattern`, `service boundary`, `bounded context`
   - Form 5 (paradigm): `props`, `state management`, `virtual DOM`, `bundler`, `reactive`, `component tree`, `hydration`
   A match is flagged unless adjacent to a non-web context clause (`or equivalent`, `[web only]`, `if applicable`, `if the project has`). Output: list of unguarded matches per term. Feeds Phase 2.A (d)+(e) for human judgment on each candidate.
8. **Reference file coverage check (stack-dependent skills only)** - for each check ID found in the body (grep pattern: `\*\*[A-Z][0-9]\+`), verify the same ID appears in the reference file (e.g., `PATTERNS.md`). Each missing ID = High candidate (skill silently provides no guidance for that check on any stack variant lacking coverage). Stack-agnostic skills: skip.

**Fail handling**: any FAIL row blocks Phase 2 entry per the Phase 1 → Phase 2 mechanical gate below. Critical findings route through Phase 3 first.

#### Phase 1 → Phase 2 mechanical gate *(P3.1 — prevents Stage A drift to Stage B)*

Before Phase 2 begins, emit a PASS/FAIL table over the 8 Phase 1 steps. Phase 2 MUST NOT start until every row reads PASS. A FAIL row routes findings through Phase 3 first; once fixed, re-run Phase 1 from step 1 and re-emit the table. The reviewer cannot mark a row PASS by judgment alone — each step has a mechanical verification (grep result, `wc -l` output, file existence, integration test count).

| Step | Check | Status | Evidence required |
|---|---|---|---|
| 1 | Anthropic spec compliance (P1 C1-C8) | PASS\|FAIL | C1-C8 result table |
| 2 | Line count ≤ 500 | PASS\|FAIL | `wc -l SKILL.md` |
| 3 | Registry ↔ body coherence | PASS\|FAIL | grep diff vs `skill-registry.js` |
| 4 | Allowed-tools ↔ body instructions | PASS\|FAIL | capability keyword grep |
| 5 | Placeholder resolution | PASS\|FAIL | `[PLACEHOLDER]` token scan |
| 6 | Model ↔ complexity alignment | PASS\|FAIL | line count + subagent heuristic |
| 7 | Architectural + paradigm vocabulary scan (forms 4+5) | PASS\|FAIL | unguarded-match list |
| 8 | Reference file coverage check (stack-dependent only) | PASS\|FAIL | check ID match across files |

***** STOP - Phase 1 → Phase 2 gate. Phase 2 entry requires 100% PASS in the table above. Reviewer judgment cannot override a FAIL row. *****

### Phase 2 - Internal analysis + walkthrough

**Executor**: Claude (analysis) + user (interactive)
**Input**: SKILL.md + Phase 1 findings + P2 + P3 + P5
**Output**: consolidated finding list for Phase 3

Grouped by gravity. 2.A/2.B/2.C autonomous; 2.D interactive; 2.E targeted on high-risk skills.

#### 2.A - Fondamentali (block Phase 6 if failed)

1. **Frontmatter↔body coherence**: argument-hint targets/modes match body handlers.
2. **Project-agnosticity test - extended** *(D3 - 4 dimensions)*:
   - **(a) Literal contamination**: no example, file path, entity name, API reference tied to a specific project. Every reference is a placeholder or universal concept. Universal = applies unchanged across ≥3 of 6 CDK-supported stacks.
   - **(b) Severity habits**: severity labels not inherited from pilot project's domain. E.g., "any hardcoded color = Critical" is a pilot-project habit; in non-UI projects, color is not Critical.
   - **(c) Remediation style**: fix suggestions not formatted/structured in pilot project's conventions. E.g., remediation always in "SwiftUI-like" declarative form.
   - **(d) Architectural assumptions**: no implicit assumption about routing, state management, persistence layer, auth pattern tied to pilot's architecture.
   - **(e) Default mental-model**: no framework-specific vocabulary ("View", "ViewModel", "@Published") or design pattern as default expectation. Also inspect fenced code blocks for test-runner idioms that are platform-specific: `describe`/`it` (JS/TS), `#[test]` (Rust), `XCTAssert*`/`func test*` (Swift XCTest), `@Test` (JUnit/NUnit) — any snippet embedding one without a cross-stack equivalent is a candidate finding flagged by Phase 1 check 7.

   If a reader who doesn't know the origin project could ask "why this specific case?" on ANY of (a)-(e), it's an artifact.

3. **Output template↔body coherence**: every report row matches body check name + severity.
4. **Multi-stack + agnostic verification**: skill applies (or explicitly gates with `[web only]`/`[SSR only]`) across CDK-supported stacks.

#### 2.B - Coerenza strutturale (cross-skill + cross-tier)

5. **Pipeline↔skill alignment**: `pipeline.md` references skill consistently.
6. **Cross-skill reference coherence**: referenced skills exist, scope boundary claimed = actual scope (verified by grep of referenced skill's body + description), no overlap.
7. **Cross-tier consistency**: for multi-tier skills, diff current variant against sibling variants. Flag unexpected deltas per taxonomy above.
8. **Boilerplate drift detection**: reference = most recently reviewed skill of same section type. Flag identical-where-should-differ or different-where-should-match.
9. **Severity calibration vs P2 scale**: each severity level aligns with domain-neutral P2 per operational "aligned" definition. Cross-skill inconsistency flagged.

#### 2.C - Raffinati

10. **Token efficiency**: per-section token count (not line count). Flag sections >500 tokens that are not core logic.
11. **Failure path**: skill handles absence of prerequisites with stop-and-report, not silent no-op.
12. **Progressive disclosure evaluation**: if line count > 300, propose split into SKILL.md + supporting files.

#### 2.D - Interactive review

13. **Anthropic compliance opportunities**: for each documented feature not currently used, evaluate:
   - `paths` glob (if platform/file-type gating in body).
   - `agent` field (if explicit subagent delegation).
   - `when_to_use` (if description near 1024-char limit).
   - Dynamic context injection (if fresh-data-at-load needed).
   - Progressive disclosure (if >300 lines).

   Per opportunity: **apply now** / **register roadmap** / **ignore**.

14. **Section-by-section walkthrough**: Claude explains purpose + CDK relevance; user flags issues.

15. **Cross-tier diff review (C6 STOP)**: if skill is multi-tier, user reviews cross-tier diff artifact (column-by-column comparison showing frontmatter, tool set, check list, severity labels, report template across variants). User approves propagation strategy.

***** STOP - cross-tier diff approval. Wait for execution keyword before Phase 2.E or Phase 3. *****

#### 2.E - Behavioral fixtures *(D1 + P3.2 - targeted, 11 stack-dependent skills)*

**Applies to**: ui-audit, visual-audit, accessibility-audit, responsive-audit, ux-audit, security-audit, api-design, migration-audit, perf-audit, test-audit, skill-db. Canonical list in `SKILLS_INVENTORY.md § Behavioral fixture targets`.
**Rationale**: these 11 skills are stack-dependent — their checks vary by stack (web/native/CLI), depend on stack-conditional dispatch, or run live verification whose output differs by dialect/runtime. Textual correctness alone cannot catch known defect classes (false-positive on system colors, dialect-specific SQL, parser-format mismatch, viewport behavior).
**Skipped for**: the other 6 skills (arch-audit, commit, context-review, dependency-scan, simplify, skill-dev) which are stack-agnostic — textual review is sufficient.

**Procedure**:
1. Define fixture pack per skill:
   - **3 representative cases**: realistic inputs the skill should handle correctly.
   - **2 adversarial cases**: edge cases or known-tricky patterns (e.g., `Color.red` as SwiftUI system color for ui-audit).
   - **1 contamination probe**: input that tests for pilot-project mental-model leakage.
2. Execute each fixture against the post-Phase-1 skill in a controlled harness (small scaffold project).
3. Record: expected output vs actual output. Mismatch = High/Critical finding.
4. Consolidate behavioral findings into Phase 3 fix list.

**Output artifact**: `docs/reviews/skills-quality-review/fixtures/<skill-name>/` with fixture inputs + expected outputs + actual outputs.

**Fail handling**: behavioral finding severity:
- Critical: skill produces wrong classification (false-positive Critical or missed Critical on adversarial).
- High: skill produces right classification but wrong remediation.
- Medium: skill output is correct but low-actionability.

### Phase 3 - Consolidated fix

**Executor**: Claude (implementation) + user (confirmation)
**Input**: findings from Phase 1 + Phase 2 (2.A-2.E)
**Output**: updated SKILL.md + green integration tests + approved diff for Phase 4

Steps:
1. Present consolidated finding list grouped by severity.
2. User confirms which findings to apply (Critical/High mandatory, Medium/Low per decision).
3. Apply fixes.
4. **Rollback protocol (C2)**: if integration tests fail after fix attempt, try max 3 diagnostic+fix cycles. After 3rd failure, revert to pre-fix state and escalate to user with root-cause hypothesis + suggested alternative. Do NOT force-pass.
5. Run integration tests (`node packages/cli/test/integration/run.js`). All green required.
6. **Doc sync (O1)**: if fix changed facts in `README.md` or `docs/operational-guide.md` (skill count, capability claim, example), update both. If integration test counts changed, update README badges + inline counts.
7. **Token budget hard check (T2.5)**: compute post-fix token count of SKILL.md. If >5000 tokens, hard-fail. Either compact (move to supporting files) or revert governance additions.

***** STOP - Phase 3 → Phase 4 (C7). User approves fix diff before external LLMs see new version. *****

### Phase 4 - LLM cross-model review

**Executor**: external models via `scripts/external-review.mjs` + human adjudication
**Input**: post-Phase-3 SKILL.md (approved diff) + Phase 5 user-adjudication rules
**Output**: residual findings

**Pre-existing reviews (O2 + C4 decision tree)**:
- If pre-existing review exists for this skill (per P3 inventory): **always re-run Phase 4 regardless of skip conditions**. Override applies.
- Archive pre-existing review to `docs/reviews/archive/` with pointer to new review.
- **Quarantine rule (GPT anchoring mitigation)**: pre-existing reviews NOT shown to reviewer until after independent Phase 4 pass completes. Pre-existing consulted only for diff comparison post-hoc.

**Conditional skip gate** (only when NO pre-existing review exists):
Skip Phase 4 when ALL three hold:
- Line count < 150
- No subagent delegation (no `Launch` verb in body)
- No custom frontmatter fields beyond documented minimum

For simple skills (commit, simplify), marginal value low. Document skip explicitly in review log.

**For all other skills**: submit to 3 models (Gemini 2.5 Pro, Mistral Large, GPT-4.1) with identical prompt:

> "Would this skill produce correct, actionable results on a [Vue/Svelte/Angular/vanilla/Python FastAPI/Go CLI/Swift iOS] project?"

**LLM adjudication rule (C1)**:
- Models produce **candidate findings**, not verdicts.
- A candidate Critical becomes BLOCKING only when:
  - (a) human reviewer verifies the finding against exact skill text AND
  - (b) either an explicit spec violation OR a failing behavioral fixture supports it.
- **Model agreement is neither necessary nor sufficient**. One model can hallucinate. Two models can share the same hallucination.
- **No single model can set severity** autonomously. Severity is assigned by human via P2 rubric.
- Candidates that don't meet (a)+(b) → logged as "unconfirmed, review at cycle close".

### Phase 5 - Residual fixes

**Executor**: Claude (implementation) + user (confirmation)
**Input**: adjudicated findings from Phase 4
**Output**: final SKILL.md + green tests

Same scrutiny as Phase 2 findings. **Emerging principle capture (O4)**: if a Phase 5 fix surfaces a pattern meeting entry criteria (a)/(b)/(c) above, trigger retroactive re-application per freeze rule.

### Phase 6 - GO

**Executor**: user
**Input**: Phase 1-5 complete + green
**Action**: explicit GO keyword. Move to next skill.

**Multi-tier skills**: Phase 6 applies only when ALL tier variants of the family are green.

### Phase 9 - Midpoint drift check *(new v1.2 per D2)*

**When**: at completion of skill #9 (midpoint of 17).
**Executor**: Claude + user.
**Input**: reviewed skills #1, #2, #3 + P5 calibration kit.

**Procedure**:
1. Re-read Phase 2 findings for skills #1, #2, #3 alongside P5 anchor catalog.
2. For each finding: ask "would I assign the same severity today?"
3. If drift > 1 severity level on any finding → recalibrate:
   - Identify drift direction (inflation / deflation).
   - Re-read P5 calibration set.
   - Either revise current severity standards to match earlier, OR revise skills #1-3 findings to match current.
   - Document decision in `drift-audit-<date>.md`.

**Fail handling**: if drift detected and unresolvable (calibration set itself ambiguous), pause cycle, update P5, user decides alignment direction.

### Phase 10 - Final mechanical sweep *(new P3.3, cycle closure, portfolio-level)*

**When**: after Phase 6 GO on the last skill of the cycle, before declaring cycle CLOSED per `## Review closing criterion`.
**Executor**: Claude (mechanical-only, no MITL, no LLM jury, no walkthrough).
**Input**: final-state `REVIEW_FRAMEWORK.md` + final-state `SPEC_SNAPSHOT.md` (authoritative reference at cycle close) + all 17 reviewed skills on disk.

**Rationale (CC6)**: pipeline hardening commits (e.g. P1.1, P1.2, P1.3, P2, P3.1 of this same cycle) land progressively during the cycle. Skills reviewed early in the cycle were calibrated against an earlier pipeline version. Without this sweep, those skills retain residual drift against the final pipeline definition that ships with the release — the drift is invisible at midpoint (Phase 9 only scores the first 3 skills) and accumulates across cycles.

**Procedure**:
1. Read final `REVIEW_FRAMEWORK.md` and `SPEC_SNAPSHOT.md` as authoritative — these are the version that ships, not the version any individual skill was originally reviewed against.
2. For each of the 17 reviewed skills, re-run **Phase 1 only** (the 8-step mechanical preflight). Do not re-run Phase 2 (walkthrough), Phase 3 (fixes), Phase 4 (LLM jury), or Phase 9 (drift). This sweep is preflight-only.
3. Emit one consolidated report at `outputs/phase10-drift-sweep-<YYYY-MM-DD>.md` with a 17 × 8 PASS\|FAIL grid (skills × Phase 1 steps).
4. **Any FAIL row → open a follow-up review item for next cycle** (e.g. record in `MEMORY.md` or roadmap backlog). Do NOT block current cycle closeout. Do NOT auto-fix. Do NOT escalate severity from the original review.

**Output**: drift-sweep report + 0 or more follow-up items for next cycle.

**Why preflight-only (not full Phase 1-6 re-run)**:
- Phase 2 walkthrough and Phase 3 fixes are MITL — re-running on 17 skills would cost the same as a full second cycle.
- Phase 1 mechanical steps catch the most common drift modes (frontmatter syntax updates, line-budget changes, registry/inventory drift, allowed-tools spec changes, placeholder grammar).
- Anything Phase 1 cannot catch (semantic / behavioral drift) goes into the next cycle's normal Phase 2-3 flow — the follow-up item ensures it isn't lost.

**Fail handling**: this phase cannot itself fail. A FAIL row is data, not a blocker. The cycle still CLOSES; the follow-up item carries the drift into the next cycle as input.

---

## Interactive decision points (man-in-the-loop)

1. **Post-pre-work**: confirm P1, P2, P3, P4, P5 sequentially.
2. **Phase 1 → Phase 2 gate (P3.1)**: confirm 100% PASS on the 8-step mechanical table before Phase 2 starts. A FAIL row cannot be waived.
3. **Phase 2.D #13**: per Anthropic opportunity, apply/roadmap/ignore.
4. **Phase 2.D #14**: section-by-section walkthrough.
5. **Phase 2.D #15 (C6)**: cross-tier diff approval (multi-tier skills only).
6. **Phase 3 step 2**: confirm findings to apply before fixes.
7. **Phase 3 → Phase 4 STOP (C7)**: approve fix diff before external LLMs.
8. **Phase 5 confirmation**: confirm LLM finding fixes.
9. **Phase 6 GO**: explicit authorization to proceed.
10. **Phase 9 (D2)**: drift check resolution if drift detected.

All other steps autonomous once corresponding gate is open.

---

## Execution artifacts

Each skill review produces:
- Finding list (Critical/High/Medium/Low breakdown).
- Decision log for opportunities (apply/roadmap/ignore with rationale).
- Updated SKILL.md.
- Updated integration test count.
- **If in 11-skill stack-dependent fixture set (D1 + P3.2)**: fixture pack + expected/actual outputs.
- Optional: roadmap entries in MEMORY.md.
- **If emerging principle (O4)**: auto-memory feedback entry + framework amendment.

The `skills-inventory.md` (P3) updated per skill: pending → reviewed: YYYY-MM-DD with session link. Retroactive: append "re-reviewed: YYYY-MM-DD (principle X)".

---

## Review closing criterion (O3)

Cycle CLOSED only when ALL hold:

1. Every P3 row has status `reviewed: YYYY-MM-DD` (no pending).
2. All multi-tier family variants reviewed.
3. All framework amendments from emerging principles (within freeze rule) retroactively applied to prior skills.
4. `README.md` + `docs/operational-guide.md` reflect post-review state.
5. Integration tests green on final state.
6. Release note summarizing the cycle drafted (blocks affected, principles captured, severity mapping changes, behavioral fixture results).
7. **Phase 9 midpoint drift check (D2)** executed and resolved.
8. **All behavioral fixtures on 11-skill stack-dependent target (D1 + P3.2)** green.
9. **Phase 10 final mechanical sweep (P3.3)** executed; the 17 × 8 drift-sweep report exists at `outputs/phase10-drift-sweep-<date>.md`. FAIL rows do NOT block closure but MUST be logged as follow-up items for the next cycle (the sweep itself is not allowed to be silently skipped).

Until all nine hold, cycle OPEN. No version bump claiming "skills quality-reviewed" can ship.

---

## Update policy

- Framework versioned. Bump when check added, removed, or materially modified.
- Pre-work artifacts regenerated when source of truth changes:
  - Anthropic docs → P1/P4 regen → trigger retroactive re-application of C1-C8 (rule (a)).
  - Skill count → P3 regen.
  - Severity model → P2 regen.
  - Reviewer team change → P5 regen.
- skill-review skill itself undergoes this review annually or on major Anthropic spec changes - dogfood.
- Emerging principles captured within freeze rule; rest roll to vNext.

---

## Open items

Resolved in v1.2:
- [x] O1-O5 omissions (v1.1)
- [x] P1 potential - retroactive re-application (v1.1) + freezed (v1.2 C3)
- [x] P2 potential - cross-tier variations (v1.1) + STOP gate + taxonomy (v1.2 C6)
- [x] Phase 2 micro-ordering (v1.1)
- [x] C1 - LLM adjudication rule
- [x] C2 - Phase 3 rollback (max 3 attempts)
- [x] C3 - Retroactive freeze criterion
- [x] C4 - Phase 4 pre-existing quarantine + override
- [x] C5 - Severity 2-layer patch (operational aligned + fix-routing + user-pain)
- [x] C6 - Cross-tier STOP + delta taxonomy
- [x] C7 - Phase 3 → Phase 4 STOP
- [x] T2.1 targeted - behavioral fixtures on 6 skills (D1)
- [x] T2.3 - reviewer drift protection (D2 - P5 + Phase 9)
- [x] T2.4 - project-agnosticity 4-dimension extension (D3)
- [x] T2.5 - token count post-fix hard check
- [x] T2.6 - P3 coverage check

Remaining before execution:
- [ ] Create P2 severity scale artifact (with user-pain dimensions)
- [ ] Create P3 skills inventory artifact (with behavioral-fixture target + pre-existing review columns)
- [ ] Create P4 Anthropic snapshot artifact
- [ ] Create P5 calibration kit artifact
- [ ] Implement skill-review skill (Block B)
- [ ] Retro-apply to ui-audit (Block C)

Deferred to vNext (v1.3 or later):
- T2.1 full - behavioral fixtures on all 18 skills (currently 6 only).
- T2.2 - bundle-level system behavior end-to-end check.
- R3 - export mode split (lite / audit / portfolio).
- Second-reviewer sample (D5 defer).

---

## Changelog

- **v1.3 (2026-05-01)**: P2 mechanical checks (CDK #131). Phase 1 check 7: architectural (layer/MVC/hexagonal/microservice/monolith/repository pattern/service boundary/bounded context) + paradigm (props/state management/virtual DOM/bundler/reactive/component tree/hydration) unguarded-match scan feeding Phase 2.A(d)+(e). Phase 1 check 8: reference file coverage check for stack-dependent skills (missing check ID = High). Phase 2.A(e): test-runner idiom detection extended to Rust (#[test]), Swift XCTest, JUnit (@Test).
- **v1.2 (2026-04-14)**: cross-model review integrated. Fixes C1-C7 convergent + T2.1 targeted (D1 behavioral fixtures on 6 skills) + T2.3 (D2 P5 calibration + Phase 9 midpoint drift check) + T2.4 (D3 4-dimensional project-agnosticity) + T2.5/T2.6 trivial. New pre-work P5. New Phase 2.E and Phase 9. Severity scale patched (C5). Retroactive re-application freezed (C3). 2 new STOP gates (C6 cross-tier + C7 Phase 3→4).
- **v1.1 (2026-04-14)**: O1-O5 omissions fixed; P1/P2 potential codified; Phase 2 regrouped (2.A/B/C/D); severity mapping clarified.
- **v1.0 (2026-04-14)**: initial consolidation.
