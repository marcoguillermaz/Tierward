# API Design Audit - Report Template

## API Design Audit - [DATE] - [TARGET] - mode: [audit|remediation|apply]
### Scope: [N] API routes
### Sources: framework route handler docs, RFC 9457, validation library docs, MDN HTTP status codes

### API Design Maturity Assessment
- HTTP semantics: low / medium / high
- Response contract quality: low / medium / high
- Error model quality: low / medium / high
- Pagination consistency: low / medium / high
- Field naming consistency: low / medium / high
- Resource modeling: low / medium / high

### Detected API Conventions (current project state)
- Routing style: [e.g. REST resource-oriented, /api/[resource]/[id]/[action]]
- Naming style: [e.g. camelCase params, snake_case DB fields]
- Error format: [e.g. { error: string } - consistent/inconsistent]
- Pagination pattern: [e.g. { items, total, page, pageSize } - partial/full]
- Validation strategy: [e.g. non-throwing validation before DB - X% of write routes]

### Pattern Checks
| # | Check | Issues | Severity | Verdict |
|---|---|---|---|---|
| N1 | HTTP verb alignment | N | Medium | ✅/⚠️ |
| N2 | URL structure & resource modeling | N | Medium | ✅/⚠️ |
| N3 | Response shape (success) | N | High | ✅/⚠️ |
| N4 | Error shape consistency | N | High | ✅/⚠️ |
| N5 | Status code correctness | N | High | ✅/⚠️ |
| N6 | Validation error access convention | N | Critical | ✅/⚠️ |
| N8 | Throwing validation in handlers | N | Critical | ✅/⚠️ |
| N9 | Body parsing without error handling | N | Critical | ✅/⚠️ |
| N10 | Top-level array response | N | Medium | ✅/⚠️ |
| N11 | Filtering/sorting param conventions | N | Low | ✅/⚠️ |
| N12 | Field naming consistency | N | Medium | ✅/⚠️ |
| N13 | Action endpoint overuse & nesting depth | N | Low | ✅/⚠️ |

### Pagination
| # | Check | Verdict | Notes |
|---|---|---|---|
| P1 | Pagination shape | ✅/⚠️ | |
| P2 | Parameter names | ✅/⚠️ | |
| P3 | Default page size | ✅/⚠️ | |
| P4 | Total count as number | ✅/⚠️ | |

### Validation
| # | Check | Verdict | Notes |
|---|---|---|---|
| V1 | Schema completeness | ✅/⚠️ | |
| V2 | Validation before DB | ✅/⚠️ | |
| V3 | Validation error quality | ✅/⚠️ | |

### Error Shape Consistency Note
Current project standard: `{ error: string }`. RFC 9457 standard: `{ type, title, status, detail }`.
Verdict: [Consistent / Inconsistent - N routes diverge with { message: } or { errors: [] }]
Recommendation: [keep current if consistent | standardize to { error, status } minimum]

### Inconsistencies requiring action ([N] total)
[route - check# - issue - standard to apply - fix]

### Strategic improvements
[Include ONLY if 3+ routes show the same structural issue. Each entry: title · impacted routes count · effort estimate (S/M/L) · suggested block name. Skip entire section if no strategic issue found - do not invent one.]

### Recommended platform standards

| Convention | Current state | Recommended standard |
|---|---|---|
| Error shape | { error: string } | keep - consistent |
| Pagination params | page + pageSize | keep - or: adopt page + limit if majority uses limit |
| Field naming in bodies | [detected: camelCase/snake_case/mixed] | [recommendation] |
| Action endpoint policy | [state-machine transitions as /[id]/[verb]] | accept with max 1 action segment per route |
| Max nesting depth | [detected max] | max 2 levels: /[resource]/[id]/[sub-resource] |
| Body parsing safety | [detected: N% wrapped in error handling] | all body parsing calls must have error handling |

---

## Backlog writing rules

For each **High/Critical** finding, persist via the backlog write-once protocol (`.claude/rules/backlog-protocol.md`; session scratch in a block, direct to `docs/refactoring-backlog.md` standalone):
- Assign ID: `API-[n]`
- Add to priority index table
- Add full detail section: `### API-[n] - [title]` with description, impacted files, fix.

For each **Medium** finding, append:
- Add to priority index table (lower priority tier)
- Add section: `### API-[n] - [title]` with description and impacted files. No fix required - mark as "planned."

**Low** findings: add only to priority index as a single line. No detail section. Include only if actionable in < 30 min.

---

## Severity guide

- **Critical**: N6 (silent wrong property on validation error); N6b (runtime error on async params access); N8 (unhandled validation exception); N9 (unhandled body parse error → 500 response)
- **High**: unbounded list endpoint (no pagination); inconsistent response shape for same entity; 200 returned with error body; divergent error shapes (`message` vs `error`); 400 used for state-conflict scenarios (should be 409)
- **Medium**: N10 top-level array; POST not returning 201 on create; N12 field naming inconsistency that breaks form-to-API contract; mixed pagination param names
- **Low**: N11 sort/filter param naming style; N13 action endpoint style; PUT vs PATCH mismatch; minor status code pedantry; `total` count not converted to number
