---
name: simplify
description: Scan changed files for complexity patterns: deep nesting, local duplication, dead code, magic values, conditional simplification. Apply minimal safe refactors to improve readability.
user-invocable: true
model: haiku
context: fork
---

## Applicability

Run on files changed in the current block after writing (Phase 2). Skip for trivial 1-file changes with <20 lines modified.

**Input**: the user invokes `/simplify` optionally followed by file paths. If no paths given, use `git diff --name-only HEAD` to find changed files. Filter to source files only (skip config, docs, generated files).

---

## Step 1 - Scan each file for simplification opportunities

For every source file in scope, check these 6 patterns:

### S1 - Early returns
Nested `if/else` where the `else` (or `if`) branch is a short return, throw, or continue. Invert the condition and return early to flatten the block.

### S2 - Nesting depth
Any block nested >3 levels deep. Extract the inner logic into a named function, or apply guard clauses (S1) to reduce depth.

### S3 - Local duplication
Two or more blocks within the same file that repeat the same logic (>3 lines identical or near-identical). Extract into a local helper.

### S4 - Conditional simplification
- Ternaries nested inside ternaries
- Boolean expressions that can collapse (`if (x) return true; return false;` → `return x;`)
- Switch/match with identical arms that can be merged

### S5 - Dead code
- Unreachable code after return/throw/break
- Commented-out code blocks (>3 lines)
- Unused local variables, parameters, or imports (only flag if confidence is high)

### S6 - Magic values
Repeated literal values (strings, numbers) used >2 times in the same file. Extract to a named constant at file/module scope.

---

## Step 2 - Apply fixes

For each finding:
1. Apply the simplification directly using the Edit tool.
2. Keep changes minimal - do not restructure surrounding code.
3. Preserve existing tests - if a rename would break imports, skip it.

---

## Step 3 - Summary

Output a compact summary:

```
/simplify - [N] files scanned, [M] changes applied

| File | Change | Pattern |
|---|---|---|
| path/to/file.ext | description of change | S1/S2/S3/S4/S5/S6 |
```

If no changes needed: `/simplify - [N] files scanned, all clean ✓`
