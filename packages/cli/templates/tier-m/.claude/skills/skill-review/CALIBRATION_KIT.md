# Reviewer Calibration Kit (P5)

**Version**: 1.0
**Created**: 2026-04-15
**Bundled with**: `/skill-review` skill (for export to user projects)
**Status**: reviewer-facing document. Read at cycle start and at Phase 9 midpoint.

**Purpose**: prevent reviewer drift across a ~34-hour, 18-skill review cycle. Drift = unconscious deviation from the severity rubric when fatigue, repetition, or recent findings bias the next judgment.

**When to read**:
- Before starting skill #1 (cycle-start anchoring).
- At Phase 9 midpoint (after skill #9, `skill-db` per P3 ordering).
- Before any skill where the reviewer feels uncertain about severity labeling.

**Read time**: 10-15 min. Not optional.

---

## 1. Severity anchor catalog

12 canonical examples, 3 per level. Two are abstract references from P2; one per level is a Tierward-specific anchor tied to a known pilot-project or spec artifact.

### Critical anchors (3)

| # | Finding | Why Critical |
|---|---|---|
| C-1 | Skill greps SQL injection on `${` only, misses `+` concatenation | Pipeline stays green on actual vulnerability - false negative on a hard invariant |
| C-2 | UI skill flags `Color.red` (SwiftUI system-adaptive) as hardcoded color | Wrong output on entire stack; destroys trust in the skill across all SwiftUI projects |
| C-3 | Frontmatter has `disable-model-invocation: true` + `user-invocable: false` | Skill is unreachable; spec-level contradiction guarantees zero runtime value |

### High anchors (3)

| # | Finding | Why High |
|---|---|---|
| H-1 | Security-audit does not check for secrets in logs | Common leak vector; recoverable via manual check but gap is painful |
| H-2 | UI skill labels every cross-origin image Critical on API-only project | Invocation context ignored; ~100% FP on wrong stack drops below Critical per FP cap |
| H-3 | `effort: high` present on 6 skills (non-documented frontmatter field) | Spec violation, mechanical to fix, but does not block execution |

### Medium anchors (3)

| # | Finding | Why Medium |
|---|---|---|
| M-1 | api-design reports inconsistent pagination across endpoints | Real finding, remediation requires team decision, not blocking |
| M-2 | arch-audit reports cyclomatic complexity 18 without threshold | Metric present, remediation path missing - actionability drags down one level |
| M-3 | Skill body references pilot-project route path literally (e.g. `/admin/users`) | Project-agnosticity violation on literal dimension, fix is a rename, not blocking |

### Low anchors (3)

| # | Finding | Why Low |
|---|---|---|
| L-1 | test-audit reports test name does not follow convention | Cosmetic; test works correctly |
| L-2 | arch-audit outputs "this module could be reorganized" without concrete proposal | Zero actionability; effectively style preference |
| L-3 | Minor inconsistency in frontmatter quoting style across skills | Stylistic; Anthropic parser accepts both |

---

## 2. Known traps (avoid these)

Trap = a pattern that has historically caused mislabeling in Tierward. Read once; do not re-evaluate at runtime - anchor on the rule.

**T-1. Staff-manager literal contamination**
Any reference to `Color.red`, SwiftUI-specific types, Vapor routes, or the pilot project's domain model (staff, shifts, invitations) in a scaffold skill is **Critical**. These artifacts survived extraction and produce false positives on every other stack.

**T-2. `effort: high` on 6 files (arch-audit × 3 + security-audit × 3)**
Non-documented field. **High** per P4 §3. Do not escalate to Critical on grounds of "frontmatter violation" - the skill still runs. Do not downgrade to Low - the spec is clear.

**T-3. Abstract inherited thinking**
Harder to detect than literal contamination. Examples: remediation written as if the stack has a design-token system (UI bias), severity defaults inherited from web-app mental model, architecture assumptions like "there is a database". Flag as **High** under project-agnosticity (P2 mental-model dimension), not Critical - fix is judgment-heavy.

**T-4. Volume-driven severity inflation**
A skill finds 40 instances of a Medium issue. Severity stays Medium. Volume belongs in roadmap prioritization, not in the severity rubric. Re-anchor on consequence per finding.

**T-5. Reviewer-pain projection**
"This was annoying to diagnose" is not a severity signal. The user may never see the diagnosis path. Anchor on user pain, not reviewer pain.

---

## 3. Pre-cycle anchoring procedure

Before reading skill #1:

1. Read §1 (anchor catalog) top-to-bottom. No skipping.
2. Read §2 (known traps). No skipping.
3. Self-check: pick 3 findings at random from §1, cover the severity column, label them, uncover, compare. If any mismatch, re-read the corresponding P2 section (`SEVERITY_SCALE.md` domain calibration) before proceeding.
4. State out loud (or in session notes): "Severity cap rule: Critical <10% FP, High <25%, Medium <40%." Verbalizing reduces drift on the first skill.

---

## 4. Phase 9 midpoint re-score procedure

Triggered after completing skill #9 (`skill-db` per P3 ordering). Before starting skill #10:

1. Re-read §1 (anchor catalog).
2. **Re-score skill #1**: open the review output from skill #1 (first in order: `ui-audit`). For each finding, re-apply the P2 decision tree without looking at the severity label originally assigned.
3. Compare original label vs re-score:
   - **No drift**: every finding lands on same label. Proceed to skill #10.
   - **Minor drift**: 1-2 findings shift by 1 severity level. Log in `DRIFT_LOG.md`, proceed.
   - **Major drift**: ≥3 findings shift by 1 level, OR any finding shifts by 2+ levels. **Stop.** Run §5 recalibration before skill #10.
4. Document the re-score outcome in the cycle tracker.

---

## 5. Recalibration procedure (triggered by major drift)

When §4 produces major drift:

1. **Quarantine skills #1-#9**: mark the review output of already-reviewed skills as "pending recalibration".
2. **Root cause analysis**: identify the drift direction (inflation: labels climbed; deflation: labels dropped). Hypothesize cause (fatigue, a specific finding that anchored too heavily, pilot-project contamination that normalized a pattern).
3. **Re-anchor**: re-read §1 + §2 + P2 in full. No shortcuts.
4. **Re-score skills #1-#9** with the recalibrated anchor. Apply corrections.
5. **Log**: write an entry in `DRIFT_LOG.md` with date, drift pattern, root cause hypothesis, corrections applied.
6. **Resume** the cycle at skill #10 with the corrected baseline.

Recalibration counts against the cycle close criterion: the cycle cannot close with an unresolved drift event.

---

## 6. Second-reviewer sample (optional, per D5)

Framework v1.2 D5 kept reviewer as Claude + user. Calibration Kit adds an optional light-weight second-reviewer check:

- Pick 2 skills at random from #1-#12.
- A second party (different human, or fresh Claude session with only P2 + P5 loaded) re-applies the severity rubric to the finding list.
- Compare labels. If divergence > 1 level on any finding: run §5 recalibration.

**When to use**: if §4 re-score shows minor drift but reviewer is uncertain whether the drift is real or a measurement artifact. Second-reviewer sample disambiguates.

---

## 7. Versioning

Bump this kit when:
- The severity anchor catalog changes (new canonical examples from real cycles).
- A new trap is identified and added to §2.
- The drift detection threshold changes.

On bump: note the version in `DRIFT_LOG.md` so drift comparisons across cycle versions stay interpretable.
