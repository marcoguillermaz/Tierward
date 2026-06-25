# /dependency-scan

> Phase 1 mandatory dependency scan. Runs all 6 checks in a single invocation - route hrefs, component import consumers, shared type/utility consumers, test file references, FK references, access control policies. Returns a structured report per check with exact file paths and line numbers. Invoke once with the full list of affected entities. Never invoke for single-check queries - use Grep directly for those.

| Tiers | Model | Flags |
|---|---|---|
| Tier M · Tier L | Haiku (fast) | — |

---

## Dove e quando

Auto-invoked at Phase 1 of the Tier M and Tier L pipelines. It rarely needs manual invocation; its purpose is to give downstream pipeline phases a verified file list before any edits begin. Run it manually only when restarting a pipeline from Phase 1 after an interruption.

## Output atteso

A structured file manifest listing routes, components, shared types, and database tables relevant to the task scope. The output feeds the Phase 1 STOP gate directly. A typical output: 14 files across 3 layers with dependency edges annotated for the phases that follow.
