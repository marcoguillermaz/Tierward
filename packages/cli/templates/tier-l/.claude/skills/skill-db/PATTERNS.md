# Database Audit - Stack Patterns

Reference file for `/skill-db`. Contains ORM/driver-specific query pattern checks.
Read this file when `Language: Go` is detected in CLAUDE.md (Step 1 of the executing agent).

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
