# Database Audit - Stack Patterns

Reference file for `/skill-db`. Holds the **stack-specific instance** of checks whose governing principle lives in `SKILL.md`. The SKILL states the universal *what* and *why* (e.g. "every table with owned/sensitive data must enforce row-level access; verify completeness"); this file holds the concrete *how* per stack (the exact SQL or query to run).

**When to read (Step 1 of the executing agent):** read the section matching the project's declared `Database`/`Language` in `CLAUDE.md`.
- `PostgreSQL` (incl. Supabase) → the two **PostgreSQL** sections below: row-level access-control verification (S4A…S4E) and schema/performance verification (S1B, S1C, S3, S5, S6, S7).
- `Language: Go` → the **Go** section (ORM/driver query patterns).
- Any other DB (MySQL, SQLite, MongoDB, app-level guards) → no stack SQL here yet; follow the non-relational / non-RLS guidance the SKILL gives inline for each check.

---

## PostgreSQL - row-level access-control (RLS) verification

This is the PostgreSQL **instance** of the SKILL's S4 "row-level access-control completeness" principle. Run these against the live DB in Step 4. They verify that RLS - Postgres's row-level access mechanism - is present and complete; a project on a different engine verifies the equivalent guard per the SKILL's inline non-RLS guidance instead.

**S4A - Policy existence (RBAC cross-reference)**
From the access-control gaps section of `db-map.md`, evaluate each flagged gap. Common patterns:
- INSERT policies missing `WITH CHECK` - any authenticated user can insert records for any owner?
- Tables with financial or sensitive data lacking role-scoped policies.

**S4B - Function-call caching in policies**
If policies call functions (e.g. `auth.uid()`), verify they are wrapped in a subselect `(select auth.uid())` for per-statement caching instead of per-row evaluation. On large tables, bare calls run once per row.
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
Flag as Medium: each policy using bare function calls not wrapped in `(select ...)`. Report table + policy name + clause.

**S4C - Explicit TO clause**
Policies without a `TO` clause apply to ALL roles including `anon`, adding overhead and surface area.
```sql
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND roles = '{public}';
```
Flag as Low: policies applying to `{public}` where `authenticated` or a specific role would be more precise. Exception: policies intended for unauthenticated access (e.g. public read on announcements).

**S4D - SELECT policy before UPDATE**
A table with an UPDATE policy but no SELECT policy may return `null` to the client after updates - the row was written but cannot be read back.
```sql
SELECT DISTINCT tablename
FROM pg_policies
WHERE schemaname = 'public' AND cmd = 'UPDATE'
EXCEPT
SELECT DISTINCT tablename
FROM pg_policies
WHERE schemaname = 'public' AND cmd IN ('SELECT', 'ALL');
```
Flag as High: any table returned.

**S4E - Views without security_invoker**
Views bypass RLS by default in Postgres unless `security_invoker = true` (Postgres 15+). A view over an RLS-protected table exposes all rows to any caller with view access.
```sql
SELECT viewname, definition
FROM pg_views
WHERE schemaname = 'public';
```
For each view: check if the underlying tables have RLS policies. If yes, flag as High unless `security_invoker = true` is explicitly set.

---

## PostgreSQL - schema & performance verification SQL

The PostgreSQL **instance** of the SKILL's schema/performance checks (S1B, S1C, S3, S5, S6, S7). The SKILL states each check's universal intent; run these against the live DB in Step 4. On a non-PostgreSQL engine, adapt each query to that engine's catalog (`information_schema` is largely portable; `pg_*` catalog views are Postgres-only) or skip with an explicit note - never a silent ✅.

**S1B - FK column index coverage**
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

**S1C - Status column row distribution (partial-index opportunity)**
```sql
SELECT '<table_name>' AS tbl, <status_column> AS status, COUNT(*)
FROM <table_name> GROUP BY <status_column>
ORDER BY tbl, status;
```

**S3 - Nullable columns on key fields**
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

**S5 - Data type antipatterns** (timestamp without tz, varchar(n), serial)
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

**S7 - Unused indexes**
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

## Go - ORM and driver patterns

Detect the active Go database driver/ORM by grepping `go.mod` and import statements.

| Driver/ORM | Detection |
|---|---|
| `database/sql` | `"database/sql"` import, no ORM |
| `pgx` | `"github.com/jackc/pgx"` import |
| `pgxpool` | `"github.com/jackc/pgx/v*/pgxpool"` import |
| `sqlx` | `"github.com/jmoiron/sqlx"` import |
| `gorm` | `"gorm.io/gorm"` import |
| `ent` | `"entgo.io/ent"` import |

Apply the section matching the detected driver. If multiple drivers are used, apply all matching sections.

---

## database/sql

| Check | Grep pattern | Flag condition |
|---|---|---|
| SQL injection | `db\.Query(.*fmt\.Sprintf\|db\.Exec(.*fmt\.Sprintf\|db\.QueryRow(.*fmt\.Sprintf` | String interpolation in query — use `?` / `$1` placeholders |
| Unprepared repeated queries | `db\.Query(` in loops without `db\.Prepare(` | Prepare once, execute many |
| Rows not closed | `db\.Query(` without `defer rows\.Close()` nearby | Resource leak |
| Unchecked `rows.Err()` | `for rows\.Next\(\)` without `rows\.Err()` check after loop | Silent iteration errors |
| Context not propagated | `db\.Query(` / `db\.Exec(` without `Context` variant (`QueryContext`, `ExecContext`) | Cannot cancel long queries |
| Max open conns not set | `sql\.Open(` without `db\.SetMaxOpenConns(` | Unbounded connection pool — can exhaust DB connections |

---

## pgx / pgxpool

| Check | Grep pattern | Flag condition |
|---|---|---|
| Single conn vs pool | `pgx\.Connect(` in server/handler code | Use `pgxpool.Connect` for concurrent workloads |
| Pool not configured | `pgxpool\.New(` without `MaxConns` in config | Default max conns may be too low or unlimited |
| SQL injection | `Exec(ctx,.*fmt\.Sprintf\|Query(ctx,.*fmt\.Sprintf` | Use `$1`-style parameters |
| Context not propagated | `conn\.Exec(\|conn\.Query(` without `ctx` first argument | Cannot cancel long queries |
| CopyFrom misuse | `conn\.CopyFrom(` with user-controlled column names | Injection via column name |

---

## sqlx

| Check | Grep pattern | Flag condition |
|---|---|---|
| Rebind missing for portability | `db\.Select(.*\?\|db\.Get(.*\?` on non-MySQL driver without `db\.Rebind(` | `?` placeholder fails on Postgres — use `db.Rebind()` |
| StructScan without explicit columns | `db\.Select(&` without a column list in query | Over-fetching — sensitive fields may be included |
| N+1 via loop | `db\.Get(` or `db\.Select(` inside `for` loop | Batch with `IN` clause or `sqlx.In()` |
| SQL injection | `db\.Exec(fmt\.Sprintf\|db\.Select(fmt\.Sprintf` | Use named/positional parameters |

---

## gorm

| Check | Grep pattern | Flag condition |
|---|---|---|
| N+1 queries | `\.Find(\|\.First(\|\.Where(` without `.Preload(` on associations | Lazy loading — each record triggers an additional query |
| Select all fields | `db\.Find(&` without `.Select(` | Returns all columns including sensitive fields |
| Raw SQL injection | `db\.Raw(.*fmt\.Sprintf\|db\.Exec(.*fmt\.Sprintf` | Interpolation in Raw/Exec — use `?` parameters |
| Missing error check | `db\.Create(\|db\.Save(\|db\.Delete(` without `.Error` check | Silent write failures |
| Transaction not rolled back | `db\.Begin()` without `defer tx\.Rollback()` or check on `tx\.Commit()` error | Resource leak on error path |
| Soft-delete bypass | `db\.Unscoped()\.Delete(` | Hard-deletes records that should be soft-deleted |

---

## General Go DB patterns

Apply regardless of ORM/driver.

| Check | Grep pattern | Flag condition |
|---|---|---|
| Transaction isolation not set | `db\.Begin()` / `pool\.Begin(ctx)` without `sql\.TxOptions{Isolation: ...}` | Default isolation may cause phantom reads in concurrent workloads |
| Connection string in source | `postgres://.*:.*@\|mysql://.*:.*@` hardcoded in Go source | Credentials in source — use env vars |
| DB referenced in init() | `db =` inside `func init()` | Init-time DB connection fails silently on cold start |
