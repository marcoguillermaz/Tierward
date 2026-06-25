# /commit

> Classify staged changes, generate conventional commit message (type/scope/body), and execute git commit. Use after any implementation phase to commit work.

| Tiers | Model | Flags |
|---|---|---|
| Tier M · Tier S · Tier L | Haiku (fast) | — |

---

## Dove e quando

Run after staging changes when you want a Conventional Commits-compliant message without writing it manually. It reads the diff, infers the type and scope, and executes the commit — removing the friction of switching context to think about commit semantics mid-implementation.

## Output atteso

A single git commit executed with a `type(scope): description` message derived from the staged diff. No report is produced. A typical output: `feat(cli): add --dry-run flag to deploy command`.
