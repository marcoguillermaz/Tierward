# /repo-hygiene

> Periodic repository cleanup sweep - finds orphaned/merged git branches, orphaned worktrees, stale `.claude/session/*.md` files, and (target:full only) orphaned documentation. Reports every finding with evidence, then executes only the branches/worktrees/session-files the user explicitly confirms via a single AskUserQuestion batch. Never deletes docs/*.md itself - those are always report-only, evidence-based, human-decided. Distinct from the Phase 8 cleanup gate (which tears down one specific block at closure) - this is the periodic sweep that catches what block-by-block cleanup misses.

| Tiers | Model | Flags |
|---|---|---|
| Tier M · Tier L | Sonnet | `"[target:full]"` |

---

## Dove e quando

<!-- TODO: describe the specific situation that justifies invoking this skill -->

## Output atteso

<!-- TODO: describe what the skill produces, format, and a typical example -->
