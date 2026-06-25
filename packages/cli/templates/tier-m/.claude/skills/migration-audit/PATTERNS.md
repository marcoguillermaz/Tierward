# Migration Audit - Stack Patterns

Reference file for `/migration-audit`. Contains tool-specific and language-specific migration safety checks.
Read this file when `Language: Go` is detected in CLAUDE.md (Step 1 of the executing agent).

---

## Go - Migration tool patterns

Apply the section matching the detected Go migration tool (golang-migrate, goose, or atlas).

### golang-migrate

golang-migrate uses paired `.up.sql` / `.down.sql` files with numeric prefixes.

| Check | What to look for | Severity |
|---|---|---|
| Missing down file | `.up.sql` file without a sibling `.down.sql` in the same directory | High — irreversible migration, no rollback path |
| Destructive DDL without rollback | `DROP COLUMN`, `DROP TABLE`, `TRUNCATE` in `.up.sql` without equivalent `ALTER TABLE ... ADD COLUMN` / `CREATE TABLE` in `.down.sql` | Critical |
| NOT NULL without DEFAULT | `ALTER TABLE.*ADD COLUMN.*NOT NULL` without `DEFAULT` on a populated table | High — table lock + backfill required on Postgres |
| Non-concurrent index creation | `CREATE INDEX` without `CONCURRENTLY` | Medium — locks table during creation on Postgres |
| Filename gap | Numeric prefix not monotonically increasing (e.g. `000003` after `000001` with no `000002`) | Medium — migration ordering corruption |
| Mixed DDL in single file | `ALTER TABLE` + `CREATE INDEX` in the same `.up.sql` without transaction boundary | Low — index creation should be a separate migration |

### goose

goose uses `-- +goose Up` / `-- +goose Down` markers in `.sql` files, or Go migration files.

| Check | What to look for | Severity |
|---|---|---|
| Missing Down section | `-- +goose Up` present without `-- +goose Down` | High — no rollback path |
| Empty Down section | `-- +goose Down` with no SQL (blank or comment only) | High — rollback is a no-op |
| Destructive DDL in Up without Down inverse | `DROP`/`TRUNCATE` in Up section without corresponding `CREATE`/`ALTER ADD` in Down | Critical |
| NOT NULL without DEFAULT | Same as golang-migrate | High |
| Non-concurrent index | `CREATE INDEX` without `CONCURRENTLY` in goose Up section | Medium |
| Go migration file missing down | `.go` migration file with `Up()` function but no `Down()` function | High |

### atlas

atlas uses `atlas.hcl` for schema definition and generates versioned migration files.

| Check | What to look for | Severity |
|---|---|---|
| Destructive change without `atlas migrate diff` | Manual `.sql` edits to atlas-managed migration directory (check git blame vs generated files) | High — bypasses atlas safety checks |
| NOT NULL without DEFAULT | Same as golang-migrate | High |
| Missing `atlas.sum` update | `atlas.hcl` or migration `.sql` modified but `atlas.sum` not updated | Medium — checksum integrity broken |
| Non-concurrent index | `CREATE INDEX` without `CONCURRENTLY` in generated SQL | Medium |
| Schema drift | `atlas.hcl` schema definition does not match latest migration SQL | High — `atlas migrate diff` would generate spurious migration |

---

## Go - General SQL safety checks

Apply regardless of migration tool when Go is detected.

| Check | Grep pattern | Severity |
|---|---|---|
| SQL injection in migration scripts | `fmt.Sprintf.*ALTER\|fmt.Sprintf.*CREATE\|fmt.Sprintf.*INSERT` in `.go` migration files | Critical |
| Transaction-unsafe multi-statement | Multiple `ALTER TABLE` statements in a single migration without explicit `BEGIN`/`COMMIT` | Medium |
| Postgres-specific syntax in MySQL project | `CONCURRENTLY\|ON CONFLICT\|RETURNING` in migrations of MySQL project (`[DB_SYSTEM]: MySQL`) | High — runtime error |
