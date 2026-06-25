# /skill-db

> Database audit: schema quality, index coverage, RLS completeness, FK cascades, query patterns. Runs live SQL verification. Migration file safety → /migration-audit.

| Tiers | Model | Flags |
|---|---|---|
| Tier M · Tier L | Sonnet | `[target:section:&lt;section&gt;|target:table:&lt;table&gt;]` |

---

## Dove e quando

Run before merging schema changes or after a query starts appearing in slow-query logs. It covers normalization issues, missing indexes, N+1 patterns in ORM usage, and RLS policy gaps that query-level profiling does not surface.

## Output atteso

A report grouped by category (schema, indexes, query patterns, RLS) with severity and file or migration reference per finding. A typical finding: a many-to-many join table missing a composite unique index, with the exact migration snippet needed to add it.
