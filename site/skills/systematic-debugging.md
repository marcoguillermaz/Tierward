# /systematic-debugging

> Enforce root-cause investigation before any fix. Use when encountering a bug, test failure, unexpected behavior, or build error.

| Tiers | Model | Flags |
|---|---|---|
| Tier M · Tier S · Tier L | Opus (deep) | — |

---

## Dove e quando

Run when a bug's root cause is unclear and the temptation is to apply a speculative fix. The STOP gate between hypothesis and fix prevents patch-on-patch cycles and is especially valuable for flaky tests, race conditions, and multi-system failures.

## Output atteso

A structured investigation log with observations, ranked hypotheses, the confirmed root cause, and a proposed fix. The fix is not applied until the STOP gate is explicitly cleared. A typical output: a confirmed nil-pointer path through three middleware layers, with the exact line that needs guarding.
