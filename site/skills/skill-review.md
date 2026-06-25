# /skill-review

> Lite-mode skill-review - runs the framework v1.2 pipeline condensed for small portfolios (2-5 skills). Executes Phase 1 preflight, Phase 2 structural review with interactive walkthrough, Phase 3 fix + rollback, Phase 6 closeout. Skips Phase 4 external LLM review and Phase 9 midpoint drift (reserved for Tier L full pipeline).

| Tiers | Model | Flags |
|---|---|---|
| Tier M · Tier L | Opus (deep) | `[skill-name] [tier:S|M|L|all] [mode:full|preflight-only|fixtures-only]` |

---

## Dove e quando

Run when adding new skills to a portfolio or after editing multiple existing ones, to verify each skill meets the spec and that tiers are coherent across the set. It catches cross-skill inconsistencies that per-skill checks miss, such as conflicting model assignments or missing behavioral fixtures.

## Output atteso

A compliance matrix per skill covering spec fields, tier assignments, model correctness, and fixture coverage, with a cross-portfolio coherence summary. A typical finding: two skills in the same tier using different model defaults for an identical task profile.
