---
name: skill-db
description: Database audit: schema quality, index coverage, RLS completeness, FK cascades, query patterns. Runs live SQL verification. Migration file safety → /migration-audit.
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
> **Database scope**: live SQL verification queries (Step 4) and checks S4-S5 target PostgreSQL system tables. Non-PostgreSQL databases will skip Step 4 and PostgreSQL-specific checks.


## Step 0 - Target resolution

Parse `$ARGUMENTS` for a `target:` token.

| Pattern | Meaning |
|---|---|
| `target:section:<other>` | Resolve to matching tables in db-map.md whose name contains `<other>` |
| `target:table:<tablename>` | Focus on a specific table and its direct FKs. |
| No argument | **Full audit - ALL tables in docs/db-map.md. Maximum depth across every schema, RLS, and query check (S1–S7).** |

**STRICT PARSING - mandatory**: derive target ONLY from the explicit text in `$ARGUMENTS`. Do NOT infer target from conversation context, recent work, active block names, or project memory. If `$ARGUMENTS` contains no `target:` token → full audit of the entire schema in db-map.md at maximum depth. When a target IS provided → act with maximum depth and completeness on that specific scope only.

Announce: `Running skill-db - scope: [FULL | target: <resolved>]`

**Target filter semantics**: apply the filter in Steps 2–4 as follows - S1 (only indexes on targeted tables and their FK children), S2/S3/S2b (only columns of targeted tables), S4 (only policies on targeted tables), S5/S6/S7 (only targeted tables).

**Critical constraints**:
- `docs/db-map.md` is the authoritative schema reference. Read it first - do NOT query the live DB to discover schema unless verifying a specific detail. If `docs/db-map.md` does not exist, derive the schema from the ORM's schema definition file (e.g. `schema.prisma`, `models.py`, migration files) or from live DB introspection in Step 4. Announce: `No db-map.md found - deriving schema from [source].`
- `[SITEMAP_OR_ROUTE_LIST]` provides the API route inventory for query pattern checks.
- Do NOT make schema changes. Audit only.
- All findings go to `docs/refactoring-backlog.md`.

---

## Step 1 - Read schema reference

Read these files in order before proceeding:

1. `docs/db-map.md` - full read. Note: tables and key columns (nullable/NOT NULL), FK graph, existing indexes (B-tree, GIN, partial), access control summary and gaps, ownership patterns (e.g. `user_id`, `owner_id`, `created_by`).
3. `[SITEMAP_OR_ROUTE_LIST]` - extract API route inventory. Required for S1A filter-column cross-reference and Step 3 scope.
4. `docs/contracts/` - read the contracts relevant to the targeted section (all contracts for full audit). Required for S2b composite UNIQUE evaluation - business rules are defined here, not derivable from schema alone.
5. `docs/refactoring-backlog.md` - scan existing `DB-[n]` entries to avoid duplicate reporting.

Do not proceed until all five reads are complete.

**Go stacks**: if `Language: Go` is detected in `CLAUDE.md`, also read the sibling `PATTERNS.md` file in this skill directory before Step 2. The Go section contains ORM/driver-specific query patterns for `database/sql`, `pgx`, `sqlx`, and `gorm` (N+1 detection, connection pool, prepared statements, transaction isolation).

---

## Step 2 - Schema quality checks (main context)

**S1 - Index coverage: filter columns + FK columns**

*Part A - Common filter columns*
Cross-reference the "Missing indexes" section of `db-map.md` with the API route list from `docs/sitemap.md`. For each table frequently filtered or ordered by a column that lacks an index, flag it.

Priority patterns to scan:
- Columns frequently used in ORDER BY or WHERE clauses (e.g. `created_at`, `updated_at`, `status`)

*Part B - FK column coverage*
For every FK relationship in the FK graph, verify that the **child** FK column is indexed. Parent primary keys are indexed by default - child FK columns must be explicitly indexed. An unindexed FK child column causes sequential scans on every JOIN and on every `ON DELETE` cascade operation.

Run in Step 4 (live DB):
```sql
SELECT
  c.conname AS fk_name,
  tbl.relname AS table_name,
  a.attname AS fk_column,
  EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.conrelid
      AND a.attnum = ANY(i.indkey)
  ) AS is_indexed
FROM pg_constraint c
JOIN pg_class tbl ON tbl.oid = c.conrelid
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
WHERE c.contype = 'f'
  AND tbl.relname NOT LIKE 'pg_%'
ORDER BY tbl.relname, a.attname;
```
Flag as Medium: `is_indexed = false` on lower-traffic tables.

*Part C - Partial index opportunity on state machine columns*

Run in Step 4 to check distribution - for each state machine table, query the status column distribution:
```sql
SELECT '<table_name>' AS tbl, <status_column> AS status, COUNT(*)
FROM <table_name> GROUP BY <status_column>
ORDER BY tbl, status;
```
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

Run in Step 4 - adapt column list from your schema's key ownership, financial, and state columns:
```sql
SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND is_nullable = 'YES'
  AND column_name IN (
    -- Add your key columns: status, owner IDs, financial dates, etc.
  )
ORDER BY table_name, column_name;
```
For each row returned: evaluate whether null is a valid business state or an oversight.
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

**S4 - RLS completeness and performance**

*Part A - Policy existence (RBAC cross-reference)*
From the access control gaps section of `db-map.md`, evaluate each flagged gap against current evidence. Common patterns to check:
- INSERT policies missing `WITH CHECK` - any authenticated user can insert records for any owner?
- Tables with financial or sensitive data lacking role-scoped policies

*Part B - Function call caching in policies* *(PostgreSQL/Supabase only)*
If using row-level security with function calls (e.g. `auth.uid()`), verify functions are wrapped in a subselect `(select auth.uid())` to enable per-statement caching instead of per-row evaluation. On tables with thousands of rows, bare function calls are invoked once per row.

Run in Step 4 (PostgreSQL):
```sql
SELECT policyname, tablename,
  CASE WHEN qual LIKE '%auth.uid()%' AND qual NOT LIKE '%(select auth.uid())%'
    THEN 'qual' ELSE '' END ||
  CASE WHEN with_check LIKE '%auth.uid()%' AND with_check NOT LIKE '%(select auth.uid())%'
    THEN ' with_check' ELSE '' END AS bare_uid_in
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    (qual LIKE '%auth.uid()%' AND qual NOT LIKE '%(select auth.uid())%')
    OR
    (with_check LIKE '%auth.uid()%' AND with_check NOT LIKE '%(select auth.uid())%')
  );
```
Flag as Medium: each policy using bare function calls not wrapped in `(select ...)`. Report table + policy name + which clause is affected.

*Part C - Explicit TO clause*
Policies without a `TO` clause apply to ALL roles including `anon`, creating unnecessary overhead and surface area.

Run in Step 4:
```sql
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND roles = '{public}';
```
Flag as Low: policies applying to `{public}` where `authenticated` or a specific role would be more precise. Exception: policies explicitly intended for unauthenticated access (e.g. public read on announcements).

*Part D - SELECT policy before UPDATE*
A table with an UPDATE RLS policy but no SELECT policy may cause the client to receive `null` after updates - the row was written but the client cannot read it back.

Run in Step 4:
```sql
SELECT DISTINCT tablename
FROM pg_policies
WHERE schemaname = 'public' AND cmd = 'UPDATE'
EXCEPT
SELECT DISTINCT tablename
FROM pg_policies
WHERE schemaname = 'public' AND cmd IN ('SELECT', 'ALL');
```
Flag as High: any table returned by this query.

*Part E - Views without security_invoker*
Views bypass RLS by default in Postgres unless `security_invoker = true` (Postgres 15+). A view over an RLS-protected table exposes all rows to any caller with view access.

Run in Step 4:
```sql
SELECT viewname, definition
FROM pg_views
WHERE schemaname = 'public';
```
For each view: check if the underlying tables have RLS policies. If yes, flag as High unless `security_invoker = true` is explicitly set.

**S5 - Data type choices**

Flag questionable data type choices from `db-map.md` Column specs. Source: wiki.postgresql.org/wiki/Don%27t_Do_This.

- **`timestamp` without timezone** → should be `timestamptz`. Plain `timestamp` stores no timezone context - arithmetic errors across timezones. Expected: all timestamp columns use `timestamptz`.
- **`varchar(n)` with arbitrary length limits** → should be `text`. `varchar(n)` takes identical storage to `text` but adds an arbitrary rejection constraint. Prefer `text + CHECK (length(col) <= N)` when a limit is genuinely required.
- **`serial` columns** → should use `IDENTITY` (Postgres 10+). `serial` creates hidden sequences with non-obvious permission and dependency behavior. `GENERATED ALWAYS AS IDENTITY` is the standard.
- **State machine columns as `text`** → no valid-value contract at DB level. Flag as Medium - consider CHECK constraint (see S2b).

Run in Step 4:
```sql
-- Detect timestamp without timezone
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND data_type = 'timestamp without time zone';

-- Detect varchar(n) columns
SELECT table_name, column_name, character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public'
  AND data_type = 'character varying'
  AND character_maximum_length IS NOT NULL;

-- Detect serial (sequences with auto-ownership)
SELECT s.relname AS seq_name, d.refobjid::regclass AS table_name
FROM pg_class s
JOIN pg_depend d ON d.objid = s.oid
WHERE s.relkind = 'S'
  AND d.deptype = 'a'
  AND d.classid = 'pg_class'::regclass;
```

**S6 - FK cascade behavior**
For each FK in the FK graph, verify delete cascade behavior and evaluate whether it reflects the intended parent-child semantics.

Run in Step 4:
```sql
SELECT
  c.conname,
  c.confrelid::regclass AS referenced_table,
  c.conrelid::regclass AS table_name,
  CASE c.confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END AS on_delete
FROM pg_constraint c
WHERE c.contype = 'f'
ORDER BY c.conrelid::regclass::text;
```

Evaluation criteria for `NO ACTION` results:
- **Flag as High**: `SET NULL` on a FK column that is NOT NULL - this combination would cause the DELETE to fail at runtime with a constraint violation.

**S7 - Unused indexes**
Indexes with zero query planner usage waste write I/O on every INSERT/UPDATE/DELETE.

Run in Step 4:
```sql
SELECT
  tablename,
  indexname,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
  (SELECT reltuples::bigint FROM pg_class WHERE relname = tablename) AS est_row_count
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan = 0
  AND indexname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC;
```

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

1. **S1B** - FK column index coverage
2. **S1C** - status column row distribution
3. **S3** - nullable columns on key financial/ownership fields
4. **S4B** - policies with bare `auth.uid()`
5. **S4C** - policies without explicit TO clause
6. **S4D** - UPDATE policies without matching SELECT
7. **S4E** - views in public schema
8. **S5** - data type antipatterns (timestamp, varchar(n), serial)
9. **S6** - FK cascade behavior

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
