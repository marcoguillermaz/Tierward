---
name: systematic-debugging
description: Enforce root-cause investigation before any fix. Use when encountering a bug, test failure, or unexpected behavior.
user-invocable: true
model: opus
context: fork
---

# Systematic Debugging

**The Iron Law**: no fix without completing Phase 1.

## When to use

Any technical issue: test failures, runtime bugs, unexpected output, build errors.

## Phase 1 — Reproduce & read evidence

1. Read the error message fully — stack trace, file paths, line numbers. Do not paraphrase.
2. Reproduce the issue consistently. List exact steps. If not reproducible: add logging, gather data, do not guess.
3. Check recent changes: git diff, new dependencies, config, environment.
4. In multi-component systems: log at each boundary to identify the failing layer before investigating further.

## Phase 2 — Hypothesize

Write the hypothesis before touching any code:

> "The root cause is [X] because [Y]."

Verify it against the Phase 1 evidence.

**\*** STOP — hypothesis written and verified. Wait for confirmation before Phase 3. **\***

## Phase 3 — Fix the root cause

1. Create a repro case before writing any fix — failing test, minimal script, or manual recipe.
2. Apply one targeted change — the root cause only. No bundled edits.
3. Verify: repro case passes, no regressions.
4. If fix fails: return to Phase 1 with new evidence. After 3 failed attempts: stop and discuss — the problem is likely architectural.

## Red flags

| Temptation | Why it fails |
|---|---|
| Proposing a fix before Phase 1 | Root cause unconfirmed |
| Multiple changes in one attempt | Cannot isolate what worked |
| 3+ fixes failed, one more | Architectural problem, not a patchable bug |
