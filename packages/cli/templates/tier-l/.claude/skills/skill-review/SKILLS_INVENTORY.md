# Skills Inventory (P3)

> **EXPORT NOTE**: this file is bundled as an example. Replace the inventory below with your project's skills before running `/skill-review`. The structure (summary stats + main table + coverage check) is the template - the content is a placeholder from Tierward's own review cycle.
>
> **How to adapt**:
> 1. Run `find .claude/skills -name SKILL.md` to list your skills.
> 2. Replace the Main inventory table with your skills.
> 3. Update the Summary stats.
> 4. Adapt Review ordering to your priorities (start with the skill with the most known issues; put Phase 9 midpoint at the midpoint of your cycle).
> 5. Run the coverage check (§ Coverage check) to verify the table matches disk.

---

**Version**: 1.0
**Created**: 2026-04-15
**Bundled with**: `/skill-review` skill
**Status**: canonical inventory of skills under review. Gate for cycle start per framework v1.2 T2.6 coverage check.

**Scope**: enumerates every SKILL.md in your project. Each row lists tier variants present on disk. Variants absent from this table but present on disk block the cycle from starting.

---

## Summary

- **Unique skills**: 17
- **Total SKILL.md files**: 39
- **Distribution**:
  - 6 skills × 3 tiers (S + M + L) = 18 files
  - 10 skills × 2 tiers (M + L) = 20 files
  - 1 skill × 1 tier (L only) = 1 file
- **Tier S skill count**: 6
- **Tier M skill count**: 16
- **Tier L skill count**: 17
- **Tier 0**: no skills (Discovery only - intentional)

---

## Main inventory

| # | Skill | S | M | L | Files | Family | Notes |
|---|---|:-:|:-:|:-:|:-:|---|---|
| 1 | accessibility-audit | - | ✓ | ✓ | 4 | cross-tier | Playwright + axe-core; SKILL.md + CHECKS.md per tier |
| 2 | api-design | - | ✓ | ✓ | 4 | cross-tier | static; SKILL.md + REPORT.md per tier |
| 3 | arch-audit | ✓ | ✓ | ✓ | 6 | cross-tier | SKILL.md + REPORT.md per tier; `effort: high` removed |
| 4 | commit | ✓ | ✓ | ✓ | 3 | cross-tier | haiku model |
| 5 | context-review | - | - | ✓ | 1 | single-tier | Tier L only (C1-C3 grep checks) |
| 6 | dependency-scan | - | ✓ | ✓ | 2 | cross-tier | haiku model |
| 7 | migration-audit | - | ✓ | ✓ | 2 | cross-tier | stack-aware DDL audit |
| 8 | perf-audit | ✓ | ✓ | ✓ | 6 | cross-tier | mode switch web/native; SKILL.md + REPORT.md per tier |
| 9 | responsive-audit | - | ✓ | ✓ | 4 | cross-tier | Playwright; SKILL.md + CHECKS.md per tier |
| 10 | security-audit | ✓ | ✓ | ✓ | 5 | cross-tier | SKILL.md + REPORT.md per M/L tier; `effort: high` removed |
| 11 | simplify | ✓ | ✓ | ✓ | 3 | cross-tier | haiku model |
| 12 | skill-db | - | ✓ | ✓ | 4 | cross-tier | live SQL verification; SKILL.md + REPORT.md per tier |
| 13 | skill-dev | ✓ | ✓ | ✓ | 3 | cross-tier | code quality audit |
| 14 | test-audit | - | ✓ | ✓ | 4 | cross-tier | SKILL.md + PATTERNS.md + REPORT.md per tier |
| 15 | ui-audit | - | ✓ | ✓ | 4 | cross-tier | static grep, token compliance; SKILL.md + PATTERNS.md per tier |
| 16 | ux-audit | - | ✓ | ✓ | 2 | cross-tier | Playwright, opus model |
| 17 | visual-audit | - | ✓ | ✓ | 4 | cross-tier | Playwright, opus model; SKILL.md + DIMENSIONS.md per tier |

**Legend**: ✓ = file present on disk, `-` = variant intentionally absent.

---

## Cross-tier families (multi-variant)

Skills with 2 or 3 tier variants. Review approach per framework v1.2 Phase 2.B: review together, findings may propagate; cross-tier STOP gate at end of Phase 2.D verifies expected-delta taxonomy (scope, verbosity, tool-set).

### 3-variant families (S + M + L)

| Family | Expected delta across tiers | Primary variant for walkthrough |
|---|---|---|
| arch-audit | minimal - same check set across tiers; M/L may add ecosystem checks | tier-m (canonical) |
| commit | identical or near-identical across tiers (haiku model, same logic) | tier-m |
| perf-audit | tier-s simpler scope; tier-l full web+native | tier-m |
| security-audit | tier-s minimal (auth + input); tier-l full (RLS + response shape + headers) | tier-m |
| simplify | identical across tiers (haiku, stack-agnostic) | tier-m |
| skill-dev | identical across tiers (confirmed in review cycle) | tier-m |

### 2-variant families (M + L)

| Family | Expected delta M -> L |
|---|---|
| accessibility-audit | **identical by design** - same checks, same CHECKS.md reference; no differentiation needed (confirmed in review cycle C2) |
| api-design | near-identical; L may add contract-versioning checks |
| dependency-scan | identical (same 6 checks) |
| migration-audit | near-identical (same safety rules) |
| responsive-audit | near-identical (same breakpoints) |
| skill-db | near-identical |
| test-audit | M minimal; L adds coverage trend |
| ui-audit | M static; L adds sitemap-aware coverage |
| ux-audit | near-identical (opus model) |
| visual-audit | **identical by design** - content is optimal at current state; no differentiation needed (confirmed in review cycle C2) |

### Single-tier skills

| Skill | Tier | Reason |
|---|---|---|
| context-review | L only | Tier L is the only tier with the full 8.5 phase that triggers C1-C3 checks |

---

## Behavioral fixture targets (per D1 + P3.2)

Framework v1.2 D1 + P3.2 (cross-LLM synthesis 2026-04-29) decision: T2.1 behavioral fixtures applied to **11 stack-dependent skills** where textual correctness is insufficient to catch known defect classes. P3.2 expands the original 6-skill D1 set with 5 stack-dependent skills previously excluded (perf-audit, responsive-audit, test-audit, ux-audit, skill-db) — same rationale, same procedure.

| Target skill | Rationale | Source |
|---|---|---|
| ui-audit | stack-specific literals (e.g. system colors flagged as hardcoded) prove literal-correctness misses stack-sensitive defects | D1 |
| visual-audit | subjective scoring (10 aesthetic dimensions) prone to domain-emotion labeling | D1 |
| accessibility-audit | axe-core rule interpretation is judgment-heavy; false positives on hidden elements | D1 |
| responsive-audit | breakpoint behavior is browser-specific; fixtures pin expected viewport-handling at 375/768/1024 | P3.2 |
| ux-audit | Nielsen heuristics interpretation is judgment-heavy; fixtures anchor task-completion + cognitive-load measurements | P3.2 |
| security-audit | false-negative risk highest (missed invariant violation) - hard invariants need fixture confirmation | D1 |
| api-design | invocation context sensitivity (runs on routes that may not exist in all stacks) | D1 |
| migration-audit | destructive-op severity depends on deployment model; fixtures pin expected labels | D1 |
| perf-audit | mode dispatch (web bundle / native I/O) is stack-conditional; fixtures validate each mode path | P3.2 |
| test-audit | coverage parser auto-detects lcov/Istanbul/Cobertura/go/tarpaulin/xcresult — fixtures validate each parser path | P3.2 |
| skill-db | live SQL verification with dialect-specific queries (Postgres / SQLite / MongoDB); fixtures pin expected reports per dialect | P3.2 |

Per skill: 3 representative cases + 2 adversarial + 1 contamination probe + 1 severity-calibration case.

---

## Review ordering

Framework v1.2 recommends the following sequence. Rationale: start with the skill that produced the motivating defect (ui-audit, Color.red), cross-tier families reviewed together, single-tier last.

1. **ui-audit** (M + L) - motivating defect, behavioral fixtures required (D1)
2. **visual-audit** (M + L) - behavioral fixtures required (D1)
3. **accessibility-audit** (M + L) - behavioral fixtures required (D1)
4. **responsive-audit** (M + L) - behavioral fixtures required (P3.2)
5. **ux-audit** (M + L) - behavioral fixtures required (P3.2)
6. **security-audit** (S + M + L) - behavioral fixtures required (D1)
7. **api-design** (M + L) - behavioral fixtures required (D1)
8. **migration-audit** (M + L) - behavioral fixtures required (D1)
9. **skill-db** (M + L) - behavioral fixtures required (P3.2); **Phase 9 midpoint drift check triggers after this skill**
10. **test-audit** (M + L) - behavioral fixtures required (P3.2)
11. **perf-audit** (S + M + L) - behavioral fixtures required (P3.2)
12. **arch-audit** (S + M + L) - **freeze cutoff: after this skill, only Critical principles enter current cycle**
13. **skill-dev** (S + M + L)
14. **dependency-scan** (M + L)
15. **simplify** (S + M + L)
16. **commit** (S + M + L)
17. **context-review** (L only)

---

## Coverage check (T2.6 - cycle-start gate)

Mechanical verification that this inventory matches disk state. Run before Phase 1 of skill #1.

```bash
# Expected: every SKILL.md on disk has a row + tier flag in the table above.
find packages/cli/templates/tier-*/.claude/skills -name SKILL.md | \
  awk -F'/' '{print $4 " " $7}' | sort
```

**Pass**: every (tier, skill) pair in the command output has a matching ✓ in the Main inventory table. Total file count = 39.

**Fail**: any pair present on disk but absent from the table blocks cycle start. Update the table first, reconcile the expected delta, then restart the coverage check.

**Also check**: no skill in the table has a ✓ for a tier that does not exist on disk (stale inventory).

---

## Versioning

Bump this inventory when:
- A skill is added, removed, or renamed in any tier.
- A tier variant is added or removed for an existing skill.
- A behavioral-fixture target changes.

On bump: trigger the coverage check again and re-verify the review ordering.
