# /context-review

> Phase 8.5 grep checks C1-C3. Runs the three mechanical grep checks of the context review in a single invocation - C1 credential patterns, C2 unresolved placeholders, C3 field name staleness. Returns pass/fail per check with matched lines. The orchestrator handles C4-C12 (judgment-required checks) in the main session after receiving this report.

| Tiers | Model | Flags |
|---|---|---|
| Tier L | Haiku (fast) | — |

---

## Dove e quando

Auto-invoked at Phase 8.5 of the Tier L pipeline after a block closes, to recompact CLAUDE.md and detect context drift before the next block begins. Manual invocation is only needed when a Tier L session is interrupted and must be resumed mid-pipeline.

## Output atteso

A recompacted CLAUDE.md written in place, plus a short drift report listing stale context blocks, outdated task references, or duplicate entries removed. A typical finding: a completed task block still marked active, removed to keep the active context accurate for subsequent phases.
