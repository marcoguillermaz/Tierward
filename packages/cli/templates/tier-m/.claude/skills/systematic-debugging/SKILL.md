---
name: systematic-debugging
description: Enforce root-cause investigation before any fix. Use when encountering a bug, test failure, unexpected behavior, or build error.
user-invocable: true
model: opus
context: fork
allowed-tools: Read Glob Grep Bash Edit
---

# Systematic Debugging

Random fixes waste time and introduce new bugs. Quick patches mask root causes.

**The Iron Law**: complete Phase 1 before proposing any fix. Skipping Phase 1 is not using this skill.

## When to use

Any technical issue: test failures, runtime bugs, unexpected output, build errors, integration failures, performance regressions.

**Use especially when:**
- "One quick fix" seems obvious — that intuition is untested
- You have already tried one fix and it did not work
- The issue appears in a multi-component system (CI → build → sign, API → service → DB)

## Phase 1 — Reproduce & read evidence

**Before any fix:**

1. **Read the error message fully.** Stack traces, file paths, line numbers, error codes. Do not paraphrase — the text often contains the direct cause.

2. **Reproduce consistently.** List exact steps that trigger the issue. If not reproducible: add logging or assertions, gather more data, do not guess.

3. **Check recent changes.** What changed that could cause this? Git diff, new dependencies, config changes, environment differences.

4. **In multi-component systems**: add a log or assertion at each component boundary. Run once to identify which layer fails, then investigate that layer specifically.

## Phase 2 — Pattern analysis

1. Find working code similar to what is broken.
2. List every difference between working and broken. Do not assume "that can't matter."
3. Identify what the broken code depends on: config, state, environment, calling conventions.

## Phase 3 — Hypothesize

Write the hypothesis before touching any code:

> "The root cause is [X] because [Y]. Prediction: if X is true, then [Z] should also be observable."

Verify the prediction against Phase 1 evidence before proceeding.

**\*** STOP — hypothesis written and verified against evidence. Wait for confirmation before Phase 4. **\***

## Phase 4 — Fix the root cause

1. **Create a repro case** before writing any fix — failing test, minimal script, or manual reproduction recipe. Must exist.

2. **One change only.** Fix the root cause identified in Phase 3. No bundled refactoring, no "while I'm here" edits.

3. **Verify.** The repro case passes. The full test suite is clean. No regressions.

4. **If the fix does not work:**
   - Count attempts. If < 3: return to Phase 1 with the new evidence.
   - If ≥ 3: stop and discuss. Three failed fixes indicate an architectural problem — not a bug that can be patched.

## Red flags

| Temptation | Why it fails |
|---|---|
| Proposing a fix before Phase 1 is done | Root cause unconfirmed — symptoms mask the real issue |
| "Quick fix now, investigate later" | Later never comes; the masked root cause resurfaces |
| Multiple changes in one attempt | Cannot isolate what worked; introduces new bugs |
| Skipping the repro case | Untested fixes rot silently when the codebase changes |
| 3+ fixes failed, one more attempt | Architectural signal — patching further adds debt |

## Common rationalizations

| Excuse | Reality |
|---|---|
| "Issue is simple, process is overkill" | Simple bugs have root causes. Phase 1 takes 5 minutes on simple bugs. |
| "Emergency — no time for process" | Systematic is faster than guess-and-check thrashing. |
| "I see the problem, let me fix it" | Seeing symptoms ≠ understanding root cause. |
| "Multiple fixes at once saves time" | Cannot isolate what worked. Creates new bugs. |
| "One more attempt after 2 failed" | 3+ failures = architecture problem. Question the pattern, not the symptom. |
