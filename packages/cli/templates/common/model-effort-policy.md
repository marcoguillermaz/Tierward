# Model & reasoning-effort selection policy

**Last verified: 2026-07-07.** Normative baseline for choosing a **model tier** and **reasoning-effort level** for a task, skill, or subagent. Provider- and stack-agnostic. `arch-audit` reads this file as the baseline for its T5 skill-model-fitness check — keep the two aligned.

This is a decision aid, not a hard gate. When a task clearly sits in one tier, just pick it; use the rubric when the choice is genuinely unclear or when justifying a cost-driven change.

---

## Capability tiers (the stable abstraction)

Concrete model IDs drift; tier *names* do not. Anchor decisions on the tier, then instantiate with the current model for your provider — check the provider's official docs for the live ID, never hard-code a versioned name here.

| Tier | For | Claude instance | Other providers |
|---|---|---|---|
| **fast** | mechanical, deterministic work: grep/pattern matching, structural checks, formatting, text extraction, enumerate-and-report | `haiku` | map to your provider's fast/cheap tier per its docs |
| **balanced** | cross-file judgment, analysis, multi-dimension scoring, code fixes, exploit reasoning | `sonnet` | map to your provider's mid/balanced tier |
| **frontier** | screenshot/visual reasoning, multi-role journey simulation, deep schema/security-model reasoning | `opus` | map to your provider's top/frontier tier |

Do **not** enumerate dated competitor model tables — they rot faster than Claude's. Name the tier; point at the provider's docs.

Reasoning effort (`low` / `medium` / `high` / `xhigh`) is a second, independent axis: a task can be `fast`-tier but need `high` effort (a fiddly deterministic transform), or `frontier`-tier at `medium`. Score both from the rubric below.

---

## Scoring rubric

Score five dimensions, each **0–2**. Sum is 0–10.

| Dimension | 0 | 1 | 2 |
|---|---|---|---|
| **Blast radius** | read-only / reports only | local, easily reverted change | wide or hard-to-reverse change |
| **Determinism** | one correct answer (grep/format) | some judgment | open-ended judgment |
| **Risk class** (damage if the output is wrong) | cosmetic / none | functional bug or data-quality issue | security boundary, data loss, irreversible action, or compliance impact |
| **Verification** | mechanically checkable (tests/grep) | partially checkable | hard to verify (needs a human, or vision) |
| **Ambiguity** | fully specified | some gaps | highly ambiguous / exploratory |

**Risk class is deliberately stack-neutral.** It is *damage if wrong*, not a fixed list of sensitive areas. Any stack maps its own concerns onto the three levels (a payments backend, a medical record store, and a CLI that deletes files all reach level 2 by different routes). Do not import another project's risk vocabulary (e.g. "auth / RLS / money") — re-derive the level from the damage this task's failure would cause on this stack.

### Score → tier + effort

| Sum | Tier | Effort |
|---|---|---|
| 0–3 | fast | low |
| 4–6 | balanced | medium |
| 7–8 | balanced (frontier if the top dimension is Verification or Ambiguity) | high |
| 9–10 | frontier | high–xhigh |

**Floors (override the sum, never downward):**
- Risk class = 2 → **never** `fast`. A security-boundary / data-loss / irreversible task runs at `balanced` minimum, regardless of a low total.
- Verification = 2 that requires vision (screenshots, rendered UI) → `frontier`. Visual correctness is not judgeable below the frontier tier.

---

## Escalation / de-escalation

**Escalate** (one tier up, or one effort level up) when, mid-task:
- the same step fails twice, or confidence is low on a level-2-risk output;
- the work reveals more ambiguity or blast radius than the initial score assumed.

**De-escalate** only for **pure discovery** subagents — enumerate-and-report work with no judgment (the classic `fast`-tier Explore subagent). De-escalating a **judgment-tier** step on cost grounds is governed by the **Model-tiering house rule** below: it is not trusted until a head-to-head probe confirms the cheaper tier catches a known-answer defect.

---

## Model-tiering house rule

The one rule the tiers and rubric above serve: **discovery runs cheap, judgment runs capable.**

- A subagent that only **enumerates and reports** — greps, lists, extracts, collects candidates and returns them with no verdict of its own — runs at the `fast` tier (the classic Explore subagent).
- A step that **judges** — decides, scores, applies a fix, rules a finding in or out — runs at its rubric-derived tier and is never dropped below it to save cost without evidence.

Locate a task on this rule with the capability-tier table and the scoring rubric; this section is the principle, those are how you apply it. Do not re-encode either here — one scheme, not two.

### Probe before you trust a cheaper judgment tier

Cost is not evidence of fitness. Before running a judgment-tier step at a lower tier to save money, validate the cheaper tier head-to-head against a known-answer defect:

1. Pick a **planted-bug fixture** — a defect the higher tier is known to catch, at a known severity, representative of what this step actually judges.
2. Run the cheaper tier on it, same input, head-to-head with the higher tier.
3. Ask: does the cheaper tier surface the **same defect at the same severity**? Not "roughly similar output" — the specific finding.
4. **Misses it → keep the higher tier.** **Matches → the de-escalation is trusted**, and you record a dated note (below) so the next reader sees the evidence, not just the cheaper choice.

This is a review-time discipline, not an automated gate — there is no probe runner (that would depend on the per-phase metrics of W4.2, which has not shipped). `arch-audit` T5 checks that any expected tier lowered below its rubric tier cites one of these notes.

### Probe log

Record each probe as a dated line, same convention as the calibration notes:
`YYYY-MM-DD — <skill/step>: probed <cheaper tier> vs <higher tier> on <fixture>, <same defect found? y/n>, decision <keep higher / downgrade>.`

_(none yet)_

---

## Alignment with arch-audit T5

T5 enforces a per-skill expected model, and — per the house rule above — flags any expected-state entry set below its rubric tier that does not cite a probe note. This policy is the *why* behind that table; the table is its *enforcement*. They must not drift into two schemes. Applying the rubric to a skill's dominant task should reproduce its T5 tier:
- mechanical Explore subagents inside skills → **fast** (`haiku`);
- cross-file judgment audits (arch-audit, security-audit, api-design, perf-audit, skill-dev, ui-audit) → **balanced** (`sonnet`);
- visual/screenshot skills (visual-audit, ux-audit, responsive-audit) and deep schema/access-model reasoning (skill-db) → **frontier** (`opus`), via the Verification/Ambiguity floors.

When T5's table and this rubric disagree for a skill, one of them is wrong — reconcile them in the same change, don't leave them inconsistent.

---

## Calibration (stub — data source live, calibration pending)

The score→tier thresholds above are **heuristic**. Principled calibration needs per-phase cost/outcome data. The per-phase metrics instrumentation now records it to **`docs/metrics/phase-log.md`** (Phase 8 collect step): `phase`, `model`, `effort`, `elapsed`, `findings`. Until enough blocks accumulate:
- treat the thresholds as a starting point, not a measured optimum;
- adjust by hand when a tier consistently under-serves (rework, missed defects) or over-serves (cost with no quality gain) a given task class, and note the change here with a date.

The phase-log feeds the **cost / over-serve** side (elapsed + model/effort vs findings) once ≥ a handful of blocks are logged. The **rework / under-serve** side (change-failure rate per tier) needs post-block outcome tracking that is not collected yet — pending. Do not auto-fit thresholds on a few rows (fit-on-noise); replace this stub with a data-driven procedure only once the log has real volume.
