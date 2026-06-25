# /migration-audit

> Stack-aware migration safety audit: data loss risks, destructive ops without rollback, NOT NULL without DEFAULT, unsafe ALTER TYPE, lock-heavy DDL, constraint sequencing. Supports Prisma, Drizzle, Supabase CLI, raw SQL.

| Tiers | Model | Flags |
|---|---|---|
| Tier M · Tier L | Sonnet | `[target:file:&lt;filename&gt;|target:range:&lt;from&gt;-&lt;to&gt;|mode:all]` |

---

## Dove e quando

Run every time a database migration is written, before it is merged or applied to staging. Lock-heavy DDL and irreversible column drops are among the highest-risk changes in any deployment — this audit is the last gate before they touch production data.

## Output atteso

A severity-tagged report per migration file covering data-loss risk, rollback feasibility, and lock duration estimates for the detected ORM or SQL dialect. A typical finding: an ALTER TABLE ADD COLUMN NOT NULL without a default on a large table, flagged as a table lock that will block writes during deployment.
