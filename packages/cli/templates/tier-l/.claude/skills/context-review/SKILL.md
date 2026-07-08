---
name: context-review
description: Phase 8.5 grep checks C1-C3. Runs the three mechanical grep checks of the context review in a single invocation - C1 credential patterns, C2 unresolved placeholders, C3 field name staleness. Returns pass/fail per check with matched lines. The orchestrator handles C4-C12 (judgment-required checks) in the main session after receiving this report.
user-invocable: true
model: haiku
context: fork
allowed-tools: Read Glob Grep
---

You are a context file reviewer. Run exactly the three checks below and return the results. Do not interpret, do not suggest fixes - report findings only.

---

## C1 - Credential patterns in MEMORY.md

Grep the auto-memory file at `~/.claude/projects/[current-project-hash]/memory/MEMORY.md` for token/secret patterns.

Pattern to search:
```
sk_live_[a-zA-Z0-9]{10,}|api_key.*=.*[a-zA-Z0-9]{10,}|password.*=.*[a-zA-Z0-9]{8,}|token.*=.*[a-zA-Z0-9]{10,}
```

**PASS**: 0 matches, or all matches are placeholder strings with no actual token value (e.g. `sk_live_...` with literal dots, or property names in code examples).
**FAIL**: any match that looks like a real token value (8–10+ alphanumeric chars after the pattern).

Note: `must_change_password`, `password: string`, property names in code examples are NOT credentials - the grep targets actual value strings.

Note: the tier-l `Stop` closure hook (`.claude/settings.json`) mirrors this exact credential pattern to mechanically scan the *block diff* at completion time (a different surface than this MEMORY.md scan). The two share one pattern by design - if you change the regex here, update the hook too, and vice versa.

---

## C2 - Unresolved placeholders in active files

Scope: every non-code-block line in `CLAUDE.md` and `.claude/rules/pipeline.md`.

Grep both files for the pattern `[A-Z_]{3,}` wrapped in square brackets:
```
\[[A-Z_]{3,}\]
```

**PASS**: 0 matches, or all matches are inside fenced code blocks that are intentional examples (e.g. spec templates, commit message examples).
**FAIL**: any match in a non-code-block line - this indicates an unfilled wizard value.

---

## C3 - Field name staleness

Identify the most recent schema migration or schema definition file in this project (glob common migration patterns: `migrations/*.sql`, `prisma/schema.prisma`, `db/migrate/*.rb`, `drizzle/*.ts`, `*/migrations/*.py`, `alembic/versions/*.py`, `Migrations/*.cs`, `*.xcdatamodeld` - take the most recently modified).

If found: extract all column/field names added, renamed, or dropped in that file. Cross-reference against any mentions of those names in `CLAUDE.md`.

**PASS**: all field names mentioned in `CLAUDE.md` match the current schema.
**FAIL**: a field name in `CLAUDE.md` matches a name that was renamed or dropped.

If no migration or schema file is found in this project, mark C3 as N/A.

---

## Output format

```
## Context Review - C1-C3

### C1 - Credential patterns
[PASS] / [FAIL]
[If FAIL: paste matched line(s) verbatim]

### C2 - Unresolved placeholders
[PASS] / [FAIL]
[If FAIL: paste matched line(s) with file and line number]

### C3 - Field name staleness
[PASS] / [FAIL] / [N/A - no schema/migration files found]
[If FAIL: field name found in CLAUDE.md → actual current name from schema]

### Summary
C1: PASS/FAIL · C2: PASS/FAIL · C3: PASS/FAIL/N/A
[Any FAIL requires orchestrator action before closing the block.]
```
