# /simplify

> Scan changed files for complexity patterns: deep nesting, local duplication, dead code, magic values, conditional simplification. Apply minimal safe refactors to improve readability.

| Tiers | Model | Flags |
|---|---|---|
| Tier M · Tier S · Tier L | Haiku (fast) | — |

---

## Dove e quando

Run after a feature is working and tests pass, or when code review feedback mentions complexity or excessive nesting. It targets logic structure rather than bugs, so it pairs well with `/code-review` rather than replacing it.

## Output atteso

Direct edits applied to source files: early returns replacing nested conditionals, dead branches removed, redundant variables collapsed. The diff is the output. A typical change: a five-level nested if-else replaced with a guard-clause chain.
