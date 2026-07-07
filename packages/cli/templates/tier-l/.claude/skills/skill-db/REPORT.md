# Skill-DB Audit - Report Template

## Skill-DB Audit - [DATE] - [SCOPE]
Sources: [DB_SYSTEM] docs (indexes, constraints, access control)

### Executive summary
[2-5 bullets - Critical and High findings only. Write concrete facts: table names, column names, line counts.
If nothing Critical/High: state that explicitly ("No Critical or High findings - schema is production-ready for this scope").
Example bullets:
- "3 tables with UPDATE policy but no SELECT policy (S4D High)" - example format

### DB maturity assessment
| Dimension | Rating | Notes |
|---|---|---|
| Schema integrity | strong / adequate / weak | [nullable gaps, type antipatterns, constraint gaps] |
| Index quality | strong / adequate / weak | [unindexed FKs, missing filter indexes, unused indexes] |
| RLS / security posture | strong / adequate / weak | [policy gaps, unsafe views, function caching] |
| Query quality | strong / adequate / weak | [N+1, unbounded, missing error handling] |
| Release readiness | ready / conditional / blocked | [blocked = any Critical finding; conditional = High findings present but workarounded] |

Rating guide: strong = no significant issues; adequate = issues exist but low production risk; weak = issues that should be resolved before next production release.

### Schema Checks
| # | Check | Verdict | Findings |
|---|---|---|---|
| S1A | Index - filter columns | ✅/⚠️ | [columns flagged] |
| S1B | Index - FK column coverage | ✅/⚠️ | [N unindexed FK columns] |
| S1C | Index - partial on status columns | ✅/⚠️ | |
| S1D | Index - GIN for UUID[] arrays | ✅/⚠️ | |
| S2 | Normalization and modeling | ✅/⚠️ | |
| S2b | Constraint completeness (CHECK + composite UNIQUE) | ✅/⚠️ | |
| S3 | Missing NOT NULL | ✅/⚠️ | |
| S4A | RLS - policy completeness | ✅/⚠️ | |
| S4B | RLS - function call caching | ✅/⚠️ | [N policies with bare function calls] |
| S4C | RLS - explicit TO clause | ✅/⚠️ | |
| S4D | RLS - SELECT before UPDATE | ✅/⚠️ | |
| S4E | RLS - views security_invoker | ✅/⚠️ | |
| S5 | Data type choices | ✅/⚠️ | [timestamp/varchar/serial hits] |
| S6 | FK cascade behavior | ✅/⚠️ | |
| S7 | Unused indexes | ✅/⚠️ | [N with 0 scans and qualifying criteria] |

### Query Pattern Checks (API routes)
| # | Check | Matches | Verdict |
|---|---|---|---|
| Q1 | N+1 queries | N | ✅/⚠️ |
| Q2 | Unhandled DB call results | N | ✅/⚠️ |
| Q3 | Select * | N | ✅/⚠️ |
| Q4 | Missing error handling on writes | N | ✅/⚠️ |
| Q5 | Unbounded queries | N | ✅/⚠️ |

### Prioritized findings
For each finding with severity Medium or above:
[SEVERITY] [ID] [check#] - [table/file:line] - [issue] - [business impact] - [fix] - [effort: S=<1h / M=half day / L=day+]

### Quick wins
[List findings that meet ALL three criteria: (a) Medium or High severity AND (b) effort S (<1 hour) AND (c) only DB migration OR only code change, not both simultaneously]
Format: "DB-[n]: [one-line description] - [migration or code change]"
If no quick wins: state explicitly.

---

## Backlog writing rules

Present all findings with severity Medium or above as a numbered decision list, sorted Critical → High → Medium:

```
Found N findings at Medium or above. Which to add to backlog?

[1] [CRITICAL] DB-? - table/check - one-line description
[2] [HIGH]     DB-? - table/check - one-line description
[3] [MEDIUM]   DB-? - table/check - one-line description
...

Reply with numbers to include (e.g. "1 2 4"), "all", or "none".
```

**Wait for explicit user response before writing anything.**

Then persist ONLY the approved entries via the backlog write-once protocol (`.claude/rules/backlog-protocol.md`) — in an active block append them to the session scratch; standalone, write them directly to `docs/refactoring-backlog.md`. Use the same entry format either way:
- Assign ID: `DB-[n]` (next available after existing DB entries)
- Add row to priority index
- Add full detail section with: issue, evidence, impacted tables/files, fix, effort, migration risk

---

## Severity guide

- **Critical**: RLS gap that allows unauthorized data access (S4A); UPDATE policy without SELECT (S4D); view bypassing RLS on sensitive table (S4E); `CASCADE` that would destroy financial records (S6)
- **High**: N+1 on a list endpoint (Q1); unhandled DB call result on a write (Q2); unbounded query on a high-volume table (Q5); unindexed FK on a write-heavy table (S1B); uncached function calls in policies on a table with thousands of rows (S4B)
- **Medium**: Missing CHECK constraint on financial column (S2b); missing composite UNIQUE where business rules require it (S2b); nullable column used in financial calculations (S3); `timestamp` without timezone (S5); `varchar(n)` with arbitrary limit (S5); `serial` instead of IDENTITY (S5); status as unconstrained text (S2b/S5); `SET NULL` on a NOT NULL FK column (S6)
- **Low**: Unused indexes with 0 scans meeting all qualifying criteria (S7); normalization observation with documented trade-off (S2); missing GIN for UUID[] (S1D); partial index opportunity where distribution warrants it (S1C); policies with `{public}` scope where a narrower role would be more precise (S4C)
