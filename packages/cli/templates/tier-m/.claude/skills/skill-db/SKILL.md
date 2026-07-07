---
name: skill-db
description: Database audit: schema quality, index coverage, row-level access-control completeness, FK cascades, query patterns. Runs live SQL verification (PostgreSQL instance in PATTERNS.md; other engines verify the equivalent guard). Migration file safety → /migration-audit.
user-invocable: true
model: sonnet
context: fork
argument-hint: [target:section:<section>|target:table:<table>]
---

## Configuration (adapt before first run)

> Replace these placeholders:
> - `[DB_SYSTEM]` - e.g. `PostgreSQL`, `MySQL`, `SQLite`, `MongoDB`
> - `[ORM_OR_CLIENT]` - e.g. `Prisma`, `Drizzle`, `Supabase JS client`, `SQLAlchemy`, `raw SQL`
> - `[API_ROUTES_PATH]` - path to API route files for N+1 check
> - `[ACCESS_CONTROL]` - e.g. `row-level security policies`, `middleware guards`, `model-level scopes`
> - `[SITEMAP_OR_ROUTE_LIST]` - file listing API routes with method, path, roles (e.g. `docs/sitemap.md`). Required for S1A cross-reference and Step 3 query pattern scope.
>
> **Database scope**: S4 (row-level access-control) states a universal principle; its PostgreSQL instance (RLS verification SQL) lives in `PATTERNS.md`, and non-Postgres engines verify the equivalent guard per S4's inline guidance. The remaining live-SQL checks (Step 4: S1B/S3/S5/S6) still target PostgreSQL system tables - on a non-PostgreSQL engine, adapt them to the engine's catalog or skip with an explicit note (never a silent ✅).


## Step 0 - Target resolution

Parse `$ARGUMENTS` for a `target:` token.

| Pattern | Meaning |
|---|---|
| `target:section:<other>` | Resolve to matching tables in db-map.md whose name contains `<other>` |
| `target:table:<tablename>` | Focus on a specific table and its direct FKs. |
| No argument | **Full audit - ALL tables in docs/db-map.md. Maximum depth across every schema, access-control, and query check (S1–S7).** |

**STRICT PARSING - mandatory**: derive target ONLY from the explicit text in `$ARGUMENTS`. Do NOT infer target from conversation context, recent work, active block names, or project memory. If `$ARGUMENTS` contains no `target:` token → full audit of the entire schema in db-map.md at maximum depth. When a target IS provided → act with maximum depth and completeness on that specific scope only.

Announce: `Running skill-db - scope: [FULL | target: <resolved>]`

**Target filter semantics**: apply the filter in Steps 2–4 as follows - S1 (only indexes on targeted tables and their FK children), S2/S3/S2b (only columns of targeted tables), S4 (only policies on targeted tables), S5/S6/S7 (only targeted tables).

**Critical constraints**:
- `docs/db-map.md` is the authoritative schema reference. Read it first - do NOT query the live DB to discover schema unless verifying a specific detail. If `docs/db-map.md` does not exist, derive the schema from the ORM's schema definition file (e.g. `schema.prisma`, `models.py`, migration files) or from live DB introspection in Step 4. Announce: `No db-map.md found - deriving schema from [source].`
- `[SITEMAP_OR_ROUTE_LIST]` provides the API route inventory for query pattern checks.
- Do NOT make schema changes. Audit only.
- All findings are persisted to `docs/refactoring-backlog.md` via the backlog write-once protocol (`.claude/rules/backlog-protocol.md`).

---

## Step 1 - Read schema reference

Read these files in order before proceeding:

1. `docs/db-map.md` - full read. Note: tables and key columns (nullable/NOT NULL), FK graph, existing indexes (B-tree, GIN, partial), access control summary and gaps, ownership patterns (e.g. `user_id`, `owner_id`, `created_by`).
3. `[SITEMAP_OR_ROUTE_LIST]` - extract API route inventory. Required for S1A filter-column cross-reference and Step 3 scope.
4. `docs/contracts/` - read the contracts relevant to the targeted section (all contracts for full audit). Required for S2b composite UNIQUE evaluation - business rules are defined here, not derivable from schema alone.
5. `docs/refactoring-backlog.md` - scan existing `DB-[n]` entries to avoid duplicate reporting.

Do not proceed until all five reads are complete.

**Stack patterns (mandatory read before Step 2)**: read the sibling `PATTERNS.md` section that matches the project's declared stack in `CLAUDE.md`. This file holds the stack-specific *how* for checks whose principle is stated inline here:
- `Database: PostgreSQL` (incl. Supabase) → the **PostgreSQL** section: all live SQL for this skill - S4 row-level access-control verification (S4A…S4E) and the schema/performance queries (S1B, S1C, S3, S5, S6, S7). Without this read, the checks below have no runnable query for a Postgres project.
- `Language: Go` → the **Go** section: ORM/driver query patterns for `database/sql`, `pgx`, `sqlx`, `gorm` (N+1, connection pool, prepared statements, transaction isolation).
- Any other engine (MySQL, SQLite, MongoDB, or app-level guards) → no stack SQL yet; apply the non-RLS guidance stated inline at S4.

---

## Step 2 - Schema quality checks (main context)

**S1 - Index coverage: filter columns + FK columns**

*Part A - Common filter columns*
Cross-reference the "Missing indexes" section of `db-map.md` with the API route list from `docs/sitemap.md`. For each table frequently filtered or ordered by a column that lacks an index, flag it.

Priority patterns to scan:
- Columns frequently used in ORDER BY or WHERE clauses (e.g. `created_at`, `updated_at`, `status`)

*Part B - FK column coverage*
For every FK relationship in the FK graph, verify that the **child** FK column is indexed. Parent primary keys are indexed by default - child FK columns must be explicitly indexed. An unindexed FK child column causes sequential scans on every JOIN and on every `ON DELETE` cascade operation.

Verify in Step 4 with the stack's catalog. PostgreSQL: run the **S1B** query from the PostgreSQL section of `${CLAUDE_SKILL_DIR}/PATTERNS.md`. Other engines: introspect the FK/index metadata (e.g. `SHOW INDEX`, ORM schema) and confirm each child FK column is indexed.
Flag as Medium: an unindexed FK child column on lower-traffic tables.

*Part C - Partial index opportunity on state machine columns*

Check the status-column distribution in Step 4 (PostgreSQL: **S1C** query in `PATTERNS.md`; other engines: an equivalent `GROUP BY status` count).
If any active-state subset is < 30% of total rows and no partial index exists on that table, flag as Low with suggested partial index.

*Part D - GIN index for array columns*
Array-type columns (e.g. `UUID[]`, `text[]`) on content tables cannot be efficiently queried with B-tree indexes.
Note: if in-memory filtering is the current strategy and is documented as intentional, flag as Low only if query strategy changes.

**S2 - Normalization and modeling**
Focus only on structural/modeling issues NOT covered by S2b (constraints), S5 (types), or S6 (FK behavior).

Check:
- Denormalized name/label columns copied from a parent record: if the parent changes, denormalized copies become stale. Assess: is there an update/sync path? If no sync mechanism exists, flag as Low ("acceptable for read performance, but stale on rename - document the trade-off").
- State machine history tables: for tables with state machine patterns, verify audit/history tables exist covering all transitions. If a state machine table has no history table, flag as Medium - financial and compliance records require an audit trail.
- Status columns stored as unconstrained `text`: from a modeling standpoint this means the schema expresses no valid-value contract at the DB level. The risk is covered in S2b Part A (CHECK constraint). Note it here only as a modeling observation, not a separate finding - avoid double-reporting with S2b.
- Array columns used instead of junction tables: evaluate whether this is an intentional trade-off. If documented as intentional, note as "documented trade-off - acceptable." Do not flag unless the query strategy changes.

For each: state whether the denormalization has a documented rationale. Only flag when the rationale is absent AND the risk is real.

**S3 - Missing NOT NULL constraints**
From `db-map.md` Column specs, identify columns that are nullable but should logically never be null in a valid record.

Verify in Step 4 (PostgreSQL: **S3** query in `PATTERNS.md`, adapting the column list to your schema's key ownership/financial/state columns; other engines: introspect column nullability from `information_schema.columns` or the ORM schema).
For each nullable key column: evaluate whether null is a valid business state or an oversight.
Best practice: the majority of columns should be NOT NULL - err toward NOT NULL unless null has a documented semantic meaning.

**S2b - Constraint completeness (CHECK + composite UNIQUE)**

Identify where DB-level constraints are missing for invariants that should hold even under direct privileged access or migration scripts.

*Part A - CHECK constraints*
Evaluate each candidate by reading the schema and business rules:
- Date columns that must not be in the future - `CHECK (date_col <= CURRENT_DATE)`
- Numeric columns with business range constraints - `CHECK (amount >= 0)`
- Status columns that should be constrained to valid values

For each: "if a row were inserted directly via service role with an invalid value, would the DB catch it?" If no, and the value drives financial calculations or state machine logic, flag as Medium.

*Part B - Composite UNIQUE constraints*

Patterns to look for in contracts:
- Junction tables (entity + collaborator, key + role) are almost always composite UNIQUE - verify each one.
- Any contract rule saying "a collaborator can only have one active X per Y" requires a DB-level UNIQUE (optionally partial, scoped to active states).

For each: anchor to the business rule from the contract, not to implementation preference. Flag as Medium if the absence would allow duplicate records currently prevented only by application code.

**S4 - Row-level access-control completeness** *(universal principle; stack-specific SQL in `PATTERNS.md`)*

**Principle:** every table holding owned or sensitive data must enforce access at the row level through *some* mechanism, and that mechanism must be complete. Verify these three completeness properties for each owned/sensitive table, regardless of engine:
1. **Write-side ownership** - a user cannot insert or update rows for another owner.
2. **Read-back** - the owner can read rows they just wrote (an UPDATE/write path with no matching read path silently returns null).
3. **No bypass** - no view, aggregate, or privileged query path returns rows the guard should hide.

A table with owned data and no enforced row-level guard at any layer is a **High** finding on any stack.

**Map each property to the concrete check for the detected stack:**
- **PostgreSQL (incl. Supabase):** RLS policies. Run the **S4A…S4E** verification SQL from the **PostgreSQL** section of `${CLAUDE_SKILL_DIR}/PATTERNS.md` (policy existence + `WITH CHECK`, function-call caching, explicit `TO` clause, SELECT-before-UPDATE, views without `security_invoker`). These execute in Step 4. Property 1 → S4A; property 2 → S4D; property 3 → S4E; S4B/S4C are Postgres performance/precision refinements.
- **Other relational engines (MySQL, SQLite):** row-level filtering enforced in the data-access layer (ORM global scopes/filters) or app-level guards. For each owned table, confirm every read and write path applies the ownership predicate - a reachable path without it is the equivalent of a missing policy.
- **Document / NoSQL (MongoDB, etc.):** rules-based access (security rules) or per-collection app-level guards. Verify the same three properties on each collection.
- **No stack-specific SQL available:** state which of the three properties you could verify and which need manual confirmation - do not report a clean S4 you could not actually check.

**S5 - Data type choices**

Flag questionable data type choices from `db-map.md` Column specs. Source: wiki.postgresql.org/wiki/Don%27t_Do_This.

- **`timestamp` without timezone** → should be `timestamptz`. Plain `timestamp` stores no timezone context - arithmetic errors across timezones. Expected: all timestamp columns use `timestamptz`.
- **`varchar(n)` with arbitrary length limits** → should be `text`. `varchar(n)` takes identical storage to `text` but adds an arbitrary rejection constraint. Prefer `text + CHECK (length(col) <= N)` when a limit is genuinely required.
- **`serial` columns** → should use `IDENTITY` (Postgres 10+). `serial` creates hidden sequences with non-obvious permission and dependency behavior. `GENERATED ALWAYS AS IDENTITY` is the standard.
- **State machine columns as `text`** → no valid-value contract at DB level. Flag as Medium - consider CHECK constraint (see S2b).

The antipatterns above are PostgreSQL-specific (timezone-aware timestamps, `text` over `varchar(n)`, `IDENTITY` over `serial`). Detect them in Step 4 with the **S5** queries in `${CLAUDE_SKILL_DIR}/PATTERNS.md`. On another engine, apply the universal type principle - timezone-aware timestamps, no arbitrary length caps, standard auto-increment - against that engine's own type catalog.

**S6 - FK cascade behavior**
For each FK in the FK graph, verify delete cascade behavior and evaluate whether it reflects the intended parent-child semantics.

Verify in Step 4 (PostgreSQL: **S6** query in `${CLAUDE_SKILL_DIR}/PATTERNS.md`; other engines: read `ON DELETE` behavior from the FK metadata or ORM relations).

Evaluation criteria for `NO ACTION` results:
- **Flag as High**: `SET NULL` on a FK column that is NOT NULL - this combination would cause the DELETE to fail at runtime with a constraint violation.

**S7 - Unused indexes**
Indexes with zero query planner usage waste write I/O on every INSERT/UPDATE/DELETE.

Verify in Step 4 (PostgreSQL: **S7** query in `${CLAUDE_SKILL_DIR}/PATTERNS.md`, which reads `pg_stat_user_indexes`; other engines: use the engine's index-usage statistics view, if available, and skip with a note if not).

---

## Step 2.5 - Migration safety review

Migration file safety checks (lock-heavy DDL, missing rollback comments, unsafe backfills, constraint sequencing, data loss risks, FK indexing, ordering integrity) are owned by the **`/migration-audit` skill** - a stack-aware static analyzer for Prisma, Drizzle, Supabase CLI, and raw SQL migrations.

When a block applies migrations, run `/migration-audit` alongside `/skill-db` in Phase 5d Track B. `/skill-db` keeps live SQL verification of schema state (RLS, indexes, FK cascades, query patterns); `/migration-audit` handles the files themselves.

---

## Step 3 - API query pattern check (Explore agent)

Launch a **single Explore subagent** (model: haiku) with the following instructions. Pass the API route file list from `[SITEMAP_OR_ROUTE_LIST]` as the file scope.

```
MATCH | check_code | file:line | matched_pattern | severity

CHECK Q1 - N+1 queries in list endpoints
Step 1 (fast): grep for DB query calls across all route files (e.g. `.from(`, `.query(`, `.find(`, `SELECT`).
Step 2 (contextual): for each match, read 15 lines of surrounding context. Flag if the DB call appears inside a for/forEach/.map( block. Multi-line patterns are common - a loop opener on line N and a DB call on line N+5 inside the same block counts as N+1.
Severity: High on list endpoints, Medium on single-record endpoints.

CHECK Q2 - Unhandled DB call results
Verify all DB write/read calls have their results consumed (assigned to a variable, returned, or passed to error handling). In async languages (JS/TS): check for `await` or `.then()` on the same call. In synchronous languages: verify the return value is checked, not discarded. Fire-and-forget DB calls cause silent failures.
Severity: High (silent data loss or stale reads).

CHECK Q3 - Select * (unbounded column fetch)
Grep: patterns selecting all columns (e.g. `SELECT *`, `.select("*")`, `.select('*')`, `.findAll()`)
Flag each match. Note whether the route returns the full object to the client (check if the result is spread into a response or filtered first).
Severity: Medium if result is returned directly to client, Low if filtered before response.

CHECK Q4 - Missing error handling on DB writes
Grep: lines with write operations (e.g. `.insert(`, `.update(`, `.delete(`, `.create(`, `.save(`) - check within 5 lines for error handling patterns (destructured error, try/catch, if error check).
Flag if no error handling pattern appears within 5 lines after the write call.
Severity: High (silent write failures cause data loss without error response).

CHECK Q5 - Unbounded queries on large tables
For each match, check within 15 lines for: .limit(, .range(, pageSize, or a comment indicating it is an intentional full export (// export, // all records).
Flag: any collection endpoint that fetches without bounds and is not an export route.
Severity: High on production-volume tables.

Return ALL matches in the MATCH | check_code | file:line | matched_pattern | severity format. If a check has zero matches, return: CLEAN | check_code | no matches found.
```

---

## Step 4 - Live DB verification

Runs live SQL against the database. **All stack-specific SQL lives in the PostgreSQL section of `${CLAUDE_SKILL_DIR}/PATTERNS.md`** (access-control S4A…S4E and schema/performance S1B, S1C, S3, S5, S6, S7) - the checks below state the universal intent; PATTERNS.md holds the runnable query. On a non-PostgreSQL engine, adapt each query to that engine's catalog or skip with an explicit note, and verify the S4 access-control properties via the stack's own mechanism (see S4). Never record a silent ✅ for a check you could not run.

1. **S1B** - FK column index coverage
2. **S1C** - status column row distribution
3. **S3** - nullable columns on key financial/ownership fields
4. **S4A…S4E** *(PostgreSQL)* - row-level access-control verification: run the queries from the PostgreSQL section of `PATTERNS.md` (policy existence + `WITH CHECK`, bare `auth.uid()` caching, explicit `TO`, SELECT-before-UPDATE, views without `security_invoker`)
5. **S5** - data type antipatterns (timestamp, varchar(n), serial)
6. **S6** - FK cascade behavior

Additionally, for each state machine table, check for invalid status values:
```sql
-- Adapt to your schema's state machine tables and status columns
SELECT '<table>' AS tbl, <status_col> AS status, COUNT(*)
FROM <table> GROUP BY <status_col>
ORDER BY tbl, status;
```

**Empty result handling**: if a query returns no rows or all-NULL values (common on staging with low data volume), record as "not verifiable on staging - [table] has insufficient data" rather than ✅. Do not treat absence of data as absence of a problem.

---

## Step 5 - Produce report and update backlog

Generate the report using the template in `${CLAUDE_SKILL_DIR}/REPORT.md`. Apply the severity guide and backlog writing rules from the same file.

---

## Execution notes

- Do NOT apply migrations or modify the schema.
- For gaps already documented in `db-map.md` ⚠️ RLS gaps section: do not re-describe them from scratch. Instead report their current status (open / resolved / risk-changed) and escalate if the gap has been open for more than 2 completed blocks without a scheduled fix. A documented gap that remains unfixed is not a reason to silence it - it is a reason to increase urgency.
- Documented trade-offs in CLAUDE.md (e.g. array columns, in-memory filtering) should be noted as known - do not flag unless query strategy changes.
- After the report, ask: "Should I prepare the SQL migrations for the identified fixes?"
