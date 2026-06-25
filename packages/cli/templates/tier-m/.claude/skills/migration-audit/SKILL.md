---
name: migration-audit
description: Stack-aware migration safety audit: data loss risks, destructive ops without rollback, NOT NULL without DEFAULT, unsafe ALTER TYPE, lock-heavy DDL, constraint sequencing. Supports Prisma, Drizzle, Supabase CLI, raw SQL.
user-invocable: true
model: sonnet
context: fork
argument-hint: [target:file:<filename>|target:range:<from>-<to>|mode:all]
---

## Configuration (adapt before first run)

> Replace these placeholders:
> - `[MIGRATIONS_PATH]` - e.g. `prisma/migrations/`, `drizzle/`, `supabase/migrations/`, `db/migrations/`
> - `[APP_SOURCE_PATH]` - path to application source for column-reference cross-checks (e.g. `src/`, `app/`)
> - `[STAGING_DB_URL]` - optional, for Step 4 applied-migration verification
>
> **Database scope**: checks target PostgreSQL DDL patterns. MySQL and SQLite migrations may trigger false negatives on lock-heavy DDL checks (M1, M6) that use PostgreSQL-specific syntax.

---

## Step 0 - Target resolution

Parse `$ARGUMENTS` for a `target:` or `mode:` token.

| Pattern | Meaning |
|---|---|
| `target:file:<filename>` | Audit a single migration file (for debugging before apply) |
| `target:range:<from>-<to>` | Audit a numeric range of migrations (e.g. `target:range:042-051`) |
| `mode:all` / no argument | **Full audit - every migration file discovered in Step 2.** |

**STRICT PARSING**: derive target ONLY from explicit text in `$ARGUMENTS`. Do NOT infer from conversation context, recent blocks, or memory.

Announce: `Running migration-audit - scope: [FULL | target: <resolved>] - stack: <pending detection>`

---

## Step 1 - Stack detection

Detect the migration framework in this priority order. First matching marker wins.

| Framework | Marker file(s) | Path pattern for migrations |
|---|---|---|
| **Prisma** | `prisma/schema.prisma` | `prisma/migrations/*/migration.sql` |
| **Drizzle** | `drizzle.config.ts` / `drizzle.config.js` | `drizzle/*.sql` (journal at `drizzle/meta/_journal.json`) |
| **Supabase CLI** | `supabase/config.toml` | `supabase/migrations/*.sql` |
| **Raw SQL** | `.sql` files in `migrations/` or `db/migrations/` | same |
| Rails | `config/application.rb` + `Gemfile` | `db/migrate/*.rb` |
| Django | `manage.py` + any `*/migrations/*.py` | `*/migrations/*.py` |
| Alembic | `alembic.ini` | `alembic/versions/*.py` |
| Flyway | `flyway.conf` or `flyway.toml` | `**/db/migration/V*__*.sql` |
| **golang-migrate** | `go.mod` + `migrations/*.up.sql` (numeric prefix `NNNNNN_name.up.sql`) | `migrations/` |
| **goose** | `go.mod` + `migrations/` with `-- +goose Up` comment in .sql, OR `.go` migration files | `migrations/` |
| **atlas** | `atlas.hcl` or `atlas.sum` | `migrations/` |

**Supported at launch**: Prisma, Drizzle, Supabase CLI, Raw SQL, golang-migrate, goose, atlas.

For Rails / Django / Alembic / Flyway: announce `Framework detected: <name> - not yet supported. The audit checks assume SQL-based migrations (PostgreSQL DDL). If your framework generates raw SQL, pass target:file: with the migration file path.` and exit 0.

If no marker is found: announce `No migration framework detected. Checked: Prisma, Drizzle, Supabase CLI, Raw SQL, golang-migrate, goose, atlas. If migrations live elsewhere, pass target:file: with the absolute path.` and exit 0.

**Go stacks**: if `Language: Go` is detected in `CLAUDE.md`, read the sibling `PATTERNS.md` file in this skill directory before Step 2. The Go section contains golang-migrate, goose, and atlas-specific safety checks (down-file pairing, tool-specific DDL lints, filename conventions).

Update announcement: `Running migration-audit - scope: [FULL | target: <resolved>] - stack: <detected>`

---

## Step 2 - Migration file discovery

Use the path pattern from Step 1. Sort migrations by numeric prefix (or by `drizzle/meta/_journal.json` order for Drizzle, or Prisma timestamp directory order).

**For `mode:all` and file count > 30**: prioritize analysis in this order:
1. All files containing `DROP`, `TRUNCATE`, `ALTER TYPE`, `RENAME` (tokens in file body).
2. The 15 most recent files by sort order.
3. Remaining files time permitting.

State: `Discovered N migration files. Auditing: <scope>`

---

## Step 3 - Static safety checks (main context)

Run all eight checks per file. Record findings with SEVERITY / CHECK / FILE:LINE / SQL / REASON.

### M1 - Lock-heavy DDL

Flag the following patterns (grep per file body):

- `CREATE INDEX` (not `CONCURRENTLY`) on a table with likely > 1000 rows (check `docs/db-map.md` if available, or flag unconditionally for tables without known row count). Severity: **High**. Suggest `CREATE INDEX CONCURRENTLY ...`.
- `CREATE INDEX CONCURRENTLY` appearing **inside** a `BEGIN` / `COMMIT` block (or any transaction marker). Severity: **Critical** - this fails at runtime in PostgreSQL. CONCURRENTLY cannot run inside a transaction.
- `ADD COLUMN <col> <type> NOT NULL` **without** `DEFAULT` in the same statement. Severity: **High** - fails immediately on tables with existing rows.
- `ADD COLUMN <col> <type> NOT NULL DEFAULT <expr>` where `<expr>` is volatile (`now()`, `random()`, `gen_random_uuid()`). Severity: **High** - triggers full table rewrite under ACCESS EXCLUSIVE lock. Suggest: add nullable, backfill, then `ALTER COLUMN ... SET NOT NULL`.
- `ALTER COLUMN <col> TYPE <new_type>` where the type change requires a cast and full rewrite (e.g. `int` → `bigint`, `text` → `uuid`). Severity: **High**.
- `RENAME COLUMN` / `RENAME TABLE`. Severity: **Medium** if there are active consumers in app source; **Low** otherwise.
- `ALTER TYPE ... RENAME VALUE` - ACCESS EXCLUSIVE lock on every table using the enum. Severity: **Medium**.

### M2 - Non-reversible operations without rollback

For any migration containing `DROP COLUMN`, `DROP TABLE`, `TRUNCATE`, `ALTER TYPE ... RENAME VALUE`, or irreversible `UPDATE <t> SET ...`:

- **Require** a rollback SQL comment block at the top of the file:
  ```sql
  -- ROLLBACK:
  -- <steps to reverse this migration>
  ```
- Severity: **High** if the comment block is absent.
- Severity: **Critical** if Step 4 confirms the file is already applied in staging/prod.

### M3 - Unsafe backfills

Flag `UPDATE <table> SET <col> = <value>` statements without a `WHERE` clause that bounds scope, or without a batching pattern (e.g. `LIMIT`, cursor loop). Holds a table-level lock for the full duration and generates replication lag.

Severity: **Medium** on any table; **High** if the table is called out as high-traffic in `docs/db-map.md` or `CLAUDE.md`.

### M4 - Constraint sequencing

If a migration changes a status / enum value (e.g. `UPDATE users SET role = 'MEMBER' WHERE role = 'USER'`), verify the sequence:

1. `ALTER TABLE ... DROP CONSTRAINT <check_constraint>`
2. `UPDATE ...` (the value rename)
3. `ALTER TABLE ... ADD CONSTRAINT <check_constraint>` with the new value set

Severity: **High** if the UPDATE appears without the surrounding DROP/ADD CONSTRAINT - would fail on tables with an existing CHECK constraint on the column.

### M5 - Data loss risk

For every `DROP COLUMN <col>`:
- Grep `[APP_SOURCE_PATH]` for references to `<col>` (field name match). If references exist, severity: **Critical** - application will break at runtime.
- If no references exist but the prior migration did NOT rename the column to `<col>_deprecated` (staged deprecation marker): severity: **High**. Data is removed before a cool-down period.

For every `DROP TABLE <t>`:
- Require a prior migration that renamed `<t>` to `<t>_deprecated` or added a deprecation comment. Severity: **High** if no staged deprecation found.

### M6 - Unsafe type changes

- `ALTER TYPE <enum> RENAME VALUE 'X' TO 'Y'` outside the M4 constraint-replay sequence: severity: **High**.
- Implicit `int` → `string` or `string` → `int` casts in ORM-generated migrations (common Prisma/Drizzle pitfall when schema column type changed). Severity: **High** if data coercion is required without an explicit `USING` clause.

### M7 - FK without indexed child column

For each `ADD CONSTRAINT ... FOREIGN KEY (<col>) REFERENCES ...`:
- Verify the same migration (or an earlier one in the same batch) adds `CREATE INDEX ON <table> (<col>)`.
- Severity: **Medium** if the index is missing - every JOIN and every ON DELETE cascade on the parent will sequential-scan the child.

### M8 - Migration ordering integrity

Compare the numeric prefix ordering of new migration files in this branch vs. the highest prefix already on `main`.

- If a new file has a prefix `N` and `main` already contains a file with prefix `M > N`, flag as **Medium** - migration ordering collision on merge. Suggest renumber.
- For Prisma (timestamp dirs): check that new timestamps are strictly greater than the highest timestamp on `main`.
- For Drizzle: check `drizzle/meta/_journal.json` ordering is consistent.

---

## Step 4 - Live DB cross-reference *(optional, Postgres / Supabase only)*

**Skip this step** if `[STAGING_DB_URL]` is not configured, or if the stack is not Postgres-backed.

For each file flagged under M2 (non-reversible without rollback), query the applied-migrations ledger:

```sql
-- Supabase CLI ledger
SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '<prefix>';

-- Prisma ledger
SELECT id, migration_name, finished_at FROM _prisma_migrations WHERE migration_name LIKE '%<prefix>%';

-- Drizzle ledger
SELECT id, hash, created_at FROM __drizzle_migrations WHERE id = <prefix>;
```

If the file is already applied to staging/prod: escalate M2 finding to **Critical** and record the note: `Already applied - rollback must be run manually if issue confirmed.`

---

## Step 5 - Report and backlog decision gate

### Output format

```
## Migration Audit - [DATE] - [SCOPE] - stack: [FRAMEWORK]

### Executive summary
[2-5 bullets - Critical and High findings only. Write concrete facts: file names, SQL line, impact.
If nothing Critical/High: state that explicitly ("No Critical or High findings - migration set is safe to apply").
Example bullets:
- "Migration 052 drops `users.legacy_id` which is referenced in src/auth/session.ts:18 (M5 Critical)"
- "Migration 047 has CREATE INDEX CONCURRENTLY inside a BEGIN block - will fail at apply time (M1 Critical)"]

### Migration maturity assessment
| Dimension | Rating | Notes |
|---|---|---|
| Rollback discipline | strong / adequate / weak | [% of destructive migrations with ROLLBACK comment] |
| Lock posture | strong / adequate / weak | [count of non-CONCURRENT CREATE INDEX, full-rewrite ALTERs] |
| Backfill safety | strong / adequate / weak | [unbatched UPDATEs on large tables] |
| Constraint hygiene | strong / adequate / weak | [DROP→UPDATE→ADD sequencing, FK without index] |
| Ordering integrity | strong / adequate / weak | [prefix collisions vs main] |
| Release readiness | ready / conditional / blocked | [blocked = any Critical; conditional = High findings exist] |

### Check verdicts
| # | Check | Verdict | Findings |
|---|---|---|---|
| M1 | Lock-heavy DDL | ✅/⚠️ | [N files flagged] |
| M2 | Non-reversible without rollback | ✅/⚠️ | |
| M3 | Unsafe backfills | ✅/⚠️ | |
| M4 | Constraint sequencing | ✅/⚠️ | |
| M5 | Data loss risk | ✅/⚠️ | |
| M6 | Unsafe type changes | ✅/⚠️ | |
| M7 | FK without indexed child | ✅/⚠️ | |
| M8 | Ordering integrity | ✅/⚠️ | |

### Prioritized findings
For each finding with severity Medium or above:
[SEVERITY] [ID] [check] - [file:line] - [SQL excerpt] - [impact] - [fix] - [effort: S=<1h / M=half day / L=day+]

### Quick wins
[Findings that meet all three: (a) Medium or High, (b) effort S, (c) single-file fix]
Format: "MIG-[n]: [one-line description]"
If no quick wins: state explicitly.
```

### Backlog decision gate

Present all findings with severity Medium or above as a numbered decision list, sorted Critical → High → Medium:

```
Found N findings at Medium or above. Which to add to backlog?

[1] [CRITICAL] MIG-? - file:line - one-line description
[2] [HIGH]     MIG-? - file:line - one-line description
[3] [MEDIUM]   MIG-? - file:line - one-line description
...

Reply with numbers to include (e.g. "1 2 4"), "all", or "none".
```

**Wait for explicit user response before writing anything.**

Then write ONLY the approved entries to `docs/refactoring-backlog.md`:
- Assign ID: `MIG-[n]` (next available after existing MIG entries)
- Add row to priority index
- Add full detail section with: issue, evidence (SQL excerpt), file:line, fix suggestion, effort, rollback risk

### Severity guide

- **Critical**: `CREATE INDEX CONCURRENTLY` inside a transaction (M1); destructive migration already applied without rollback (M2); `DROP COLUMN` on a column referenced in app source (M5)
- **High**: `ADD COLUMN NOT NULL` without DEFAULT (M1); `ADD COLUMN NOT NULL DEFAULT <volatile>` (M1); full-rewrite `ALTER COLUMN TYPE` (M1); destructive migration missing ROLLBACK comment, not yet applied (M2); unbatched UPDATE on high-traffic table (M3); value rename missing constraint-replay (M4); `DROP TABLE` without staged deprecation (M5); unsafe type coercion without explicit cast (M6)
- **Medium**: `CREATE INDEX` without CONCURRENTLY on smaller tables (M1); `RENAME COLUMN` with active consumers (M1); `ALTER TYPE RENAME VALUE` (M1); unbatched UPDATE on low-traffic table (M3); FK without companion index (M7); ordering prefix collision vs main (M8)
- **Low**: `RENAME COLUMN` with no consumers (M1)

---

## Execution notes

- Do NOT apply, modify, or write any migration file. Audit only.
- Do NOT connect to production DB. Staging DB is acceptable for Step 4 with explicit `[STAGING_DB_URL]` config.
- `docs/db-map.md` (if present) is authoritative for "high-traffic" table classification used by M3.
- After the report, ask: "Should I prepare corrected SQL migrations for the identified fixes?" Reply with `yes` only after the user has signed off on the specific findings.
- This skill complements `/skill-db`: `/migration-audit` handles static analysis of migration files; `/skill-db` handles live SQL verification of schema state, RLS policies, index coverage, and query patterns. Run both during Phase 5d Track B when a block applies migrations.
