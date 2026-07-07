---
name: api-design
description: API design audit: endpoint naming, HTTP verbs, response shapes, error codes, pagination, validation consistency. Run when adding or modifying API routes.
user-invocable: true
model: sonnet
context: fork
argument-hint: [target:section:<section>|target:role:<role>|mode:audit|mode:remediation|mode:apply]
---

**Scope**: endpoint naming, HTTP verbs, resource modeling, response shapes, error codes, field naming, filtering/sorting conventions, pagination, validation, auth/authz boundary clarity.
**Out of scope**: auth implementation → `/security-audit` | performance → `/perf-audit` | DB schema → `/skill-db`.
**Default mode**: audit (no code changes). Modes: `audit` | `remediation` (propose plan, no changes) | `apply` (make focused fixes).
**All audit findings are persisted to `docs/refactoring-backlog.md` via the backlog write-once protocol (`.claude/rules/backlog-protocol.md`).**

### Configuration

| Placeholder | Description | Example |
|---|---|---|
| `[SITEMAP_OR_ROUTE_LIST]` | File listing all API routes with method, path, roles, and grouping | `docs/sitemap.md`, `docs/routes.md` |

**Unfilled behavior**: if `[SITEMAP_OR_ROUTE_LIST]` is not filled, the skill discovers routes by scanning the project's route handler directories. Announce the discovered routes before proceeding.

### Status code reference (source: MDN + RFC 9457)
- **400** - malformed request: bad JSON, schema validation failure, missing required field
- **401** - not authenticated (no valid session)
- **403** - authenticated but lacks permission
- **404** - resource not found
- **409** - valid request conflicts with current server state (e.g., approving an already-approved record, duplicate unique value)
- **422** - semantically invalid data that passes schema validation but violates a business rule
- **500** - unexpected server error (no internal details in response)

---

## Step 0 - Target and mode resolution

Parse `$ARGUMENTS` for `target:` and `mode:` tokens.

**Target:**
| Pattern | Meaning |
|---|---|
| `target:section:export` | Only export/bulk routes (example) |
| `target:section:<other>` | Resolve by reading `[SITEMAP_OR_ROUTE_LIST]` API routes section, filtering for routes whose path or group label contains `<other>`. Announce the resolved route list before proceeding. |
| No argument | **Full audit - ALL API routes across the entire codebase. Maximum depth.** |

**STRICT PARSING - mandatory**: derive target ONLY from the explicit text in `$ARGUMENTS`. Do NOT infer target from conversation context, recent work, active block names, or project memory. If `$ARGUMENTS` contains no `target:` token → full audit across ALL API routes at maximum depth. When a target IS provided → act with maximum depth and completeness on that specific scope only.

**Target scoping - comparative vs independent checks (mandatory):** a subset of checks derive a *project-wide convention* by counting usage across the whole route set; the rest evaluate one route or file in isolation.
- **Comparative checks - full-project by design; the `target:` filter does NOT apply to them:** N3, N4, N11, N12, Step 2b, Step 3 (P1, P2). They MUST run across the FULL route inventory even when a target is given. Narrowing a comparative check to the target subset computes the "convention" from a partial sample, so it flags conforming routes as deviations - a false positive by construction.
- **Independent checks - target-safe:** every other check (N1, N2, N5, N6, N6b, N8, N9, N10, N13, P3, P4, V1, V2, V3) evaluates a single route/file and safely honors the `target:` filter.
- When a `target:` is given: apply the filter to the independent checks only; run the comparative checks across all routes and state in the report that they ran full-project by design.

**Mode:**
| Token | Behavior |
|---|---|
| `mode:audit` (default) | Report findings only. No code changes. Write to backlog. |
| `mode:remediation` | Produce a prioritized improvement plan with migration guidance. No code changes. |
| `mode:apply` | Make focused, non-breaking fixes to routes only. Prefer one-liner diffs. Breaking changes require explicit user confirmation. |

Announce: `Running api-design - scope: [FULL | target: <resolved>] - mode: [audit|remediation|apply]`
Apply the target filter to the route inventory in Step 1.

---

## Step 1 - Build API inventory

Read `[SITEMAP_OR_ROUTE_LIST]` API routes section. Build a complete list of all routes (filtered by target scope). For each route: read the actual route file to determine HTTP methods, request body shape, and response shape - do not infer from sitemap entries alone, as sitemap descriptions may be incomplete.

Group routes by functional area (derived from `[SITEMAP_OR_ROUTE_LIST]`):
- Core entity routes (CRUD for primary domain objects)
- Role-specific domain routes (include all non-admin, non-cron routes per role)
- Jobs/cron routes
- Export: routes returning CSV/XLSX

Also read current `docs/refactoring-backlog.md` to avoid duplicates.

---

## Step 2 - Pattern checks (two Explore subagents, run in parallel)

Split into two parallel Explore subagents (model: haiku) to stay within context budget. Launch both at once. Read `${CLAUDE_SKILL_DIR}/PATTERNS.md` for stack-specific grep patterns used across checks.

**CHECK N1 - HTTP verb / action alignment**
For each route file, identify the exported function names (GET, POST, PUT, PATCH, DELETE).
Flag mismatches:
- POST used for read-only operations (should be GET)
- PUT used for partial updates (should be PATCH - PUT implies full replacement)
- DELETE used with a request body (non-standard)
- GET handlers that modify state (write to DB)

**CHECK N2 - URL structure consistency**
From route file paths, flag:
- Nested routes that skip a level: e.g. `/api/documents/sign` but also `/api/documents/[id]/sign`

**CHECK N3 - Response shape consistency (success)** - [COMPARATIVE - full-project baseline; ignores target filter]
Grep for the framework's JSON response pattern (see PATTERNS.md → N3) across all route files.
For each route returning a single entity (GET /[id]): check if the top-level key is consistent - e.g. `{ compensation }` vs `{ data }` vs `{ result }` vs naked object. The same entity must use the same wrapper key across all routes.
For each route returning a list: check if the shape is `{ items, total, page }` or a naked array.
Flag: any inconsistency in the key name for the same entity type across different routes.

**CHECK N4 - Error response shape consistency** - [COMPARATIVE - full-project baseline; ignores target filter]
Two-pass approach to handle multi-line JSON response calls:
Pass 1: Grep for non-standard error keys in route files: `\"message\":|\{ message:|'message':|\{ msg:|\{ errors:`
Flag every match - these are clear violations of the `{ error: string }` project standard.
Pass 2: Grep for `\"error\":` to confirm the standard key is present in the majority of files.
Report: N files use `message`, M files use `error`. Flag all `message`/`msg`/`errors` users.
Do NOT rely on same-line status code matching - status may be on a separate line.

**CHECK N5 - Status code correctness**
Grep for common misuses:
- `status: 200` on a successful POST - look for route files exporting `POST` that return `status: 200` (check within 30 lines of the JSON response return at the end of success paths)
- `status: 400` for authorization errors (should be 403)
- `status: 500` for validation errors (should be 400)
- `status: 200` anywhere in a file that also has `error:` in the same return statement
- `status: 400` in files that also contain state machine transitions or status checks - state conflicts should return 409, not 400. Flag as 'review needed', not definitive violation.
Flag each match with the correct status code.

**CHECK N6 - Validation error access convention**
Validation error details must be accessed via the library's documented property - not a similar-but-wrong name that returns `undefined` or loses field-level detail.
See PATTERNS.md → N6 for correct vs incorrect property per validation library.

**CHECK N6b - Async params access (framework-specific)**
Some frameworks require async handling of route params. Check PATTERNS.md → N6b for whether this applies to the detected framework. Skip if not applicable.

---

### Subagent B - checks N8-N13 (validation safety, json try/catch, top-level array, params, field naming, resource modeling)

**CHECK N8 - Throwing validation in route handlers**
Validation in route handlers must use the non-throwing API variant (see PATTERNS.md → N8 for correct vs throwing patterns per library). The throwing variant causes unhandled exceptions that become 500 responses.
Two-pass:
1. Grep for the throwing validation call pattern for the project's validation library.
2. For each candidate: check if the SAME FILE contains error handling that wraps it. If the file has no error handling around the call → definite violation. If error handling exists → mark as "review needed".
Expected: 0 matches in files with no error handling at all.

**CHECK N9 - Request body parsing without error handling**
Two-pass approach (avoids the "±10 lines" false-positive problem):
Pass 1: Grep all route files for the framework's request body parsing call (see PATTERNS.md → N9). Collect file list.
Pass 2: For each file in that list, check if the file also contains error handling wrapping the parse call.
- File has body parsing AND no error handling → **definite violation** - flag.
- File has body parsing AND has error handling → **mark as "review needed"** (error handling may or may not wrap the parse call - human verification needed).
Report separately: N definite violations (no error handling at all) + M files needing review.
A malformed request body that throws an unhandled exception becomes a 500 response with no useful error message.
Expected: 0 definite violations.

**CHECK N10 - Top-level array response**
Grep for JSON response calls returning an array literal (adapt pattern to the framework's response helper).
Flag: any route returning a bare array at the top level of the JSON response.
Expected: 0 matches. All responses must be wrapped in an object: `{ items: [...] }` not `[...]`. This allows adding `meta`, `pagination`, or `error` fields later without a breaking change.

**CHECK N11 - Filtering and sorting param naming conventions** - [COMPARATIVE - full-project baseline; ignores target filter]
For each match: extract the parameter name string (the string literal argument).
Step 1 - Inventory: collect ALL query param names used across all routes. Group by semantic role:
- Pagination: `page`, `pageSize`, `limit`, `offset`, `cursor`
- Sort: `sort`, `sortBy`, `order`, `orderBy`, `sort_by`
- Filter: any domain-field name used as filter
- Search/text: `q`, `search`, `query`, `keyword`
Step 2 - Convention derivation: count usage frequency for each semantic role. The most-used name in each group IS the project convention.
Step 3 - Flag deviations: any param name in a semantic group that differs from the majority convention is a violation.
Step 4 - Case style: if the majority of params are camelCase, flag any snake_case param (and vice versa).
Report the derived convention and list all deviations from it.

**CHECK N12 - Field naming consistency in request/response bodies** - [COMPARATIVE - full-project baseline; ignores target filter]
For each route file: read the validation schema declarations (POST/PATCH body schemas) to extract request field names. For response keys, grep for the framework's JSON response pattern and read up to 40 lines after the opening brace to capture the full response object (stop at the matching closing parenthesis line).
Extract field names from both sources.
Flag:
- Boolean field naming: consistent prefix (`is_`, `has_`) or lack thereof - flag mixed usage only if inconsistent within the same entity type
Note: DB column names (snake_case) may appear in raw database queries - these are NOT violations. Only flag fields in the JSON request/response contract layer.

**CHECK N13 - Resource modeling: action endpoint overuse and nesting depth**
From route file paths (no code read needed), analyze the URL structure:
Flag action endpoints that could be replaced by a resource + HTTP verb:
- Pattern: `/api/[resource]/[id]/[verb]` where verb is `approve`, `reject`, `sign`, `send`, `publish`, `archive`, `restore`, `revoke` - these are legitimate state-machine transitions; note them as ACCEPTED if the verb maps to a single state transition
- Pattern: `/api/[resource]/[verb]-bulk` or `/api/[resource]/bulk-[verb]` - flag naming inversion (approve-bulk vs bulk-approve); flag if inconsistent across resources
Flag deep nesting (3+ levels):
- Pattern: `/api/[a]/[id]/[b]/[id]/[c]` - challenge whether nesting is justified by strict ownership (c only exists in context of b in a) or could be flattened
Count total action-style path segments (non-resource, non-ID segments) vs total resource segments. Report ratio."

---

## Step 2b - Route coverage verification (main context, after both subagents complete) - [COMPARATIVE - full-project baseline; ignores target filter]

Cross-check: confirm the route inventory from Step 1 (derived from `[SITEMAP_OR_ROUTE_LIST]`) matches the actual filesystem.

Flag any route file present on filesystem but absent from the route inventory - these routes were excluded from all N1-N13 checks. Add them to the findings as "undocumented routes" requiring manual audit.

This step takes < 1 minute. Do not skip it even on targeted runs.

---

## Step 3 - Pagination consistency check (main context)

Derive the list of paginated endpoints dynamically:
Read `[SITEMAP_OR_ROUTE_LIST]`. Select all `GET` routes whose path does NOT contain `[id]` (i.e., collection endpoints, not single-resource endpoints). These are the candidates for pagination audit.

For each collection endpoint, read the GET handler. Verify:

**P1 - Consistent pagination shape** - [COMPARATIVE - full-project baseline; ignores target filter]
Target convention: `{ items: T[], total: number, page: number, pageSize: number }`. If the majority of existing paginated endpoints already use a different shape, treat that shape as the project convention and flag deviations from it - do not force a migration to the target convention if the project has established a different consistent standard.
Flag any list endpoint using a shape that differs from the majority convention.
Flag any list endpoint returning a bare array (overlap with N10 - flag independently).
Flag any list endpoint with no pagination at all that returns unbounded results.

**P2 - Pagination parameter names** - [COMPARATIVE - full-project baseline; ignores target filter]
Check if all paginated endpoints use the same query param names (`page`, `pageSize` - not `limit`/`offset`).
Flag inconsistencies.

**P3 - Default page size**
Check if a missing `pageSize` param falls back to a safe default (e.g. 50). Flag any endpoint with no default that could return unbounded results.

**P4 - Total count as number (not string)**
Some database clients return count as a string. Verify that paginated endpoints convert count to the appropriate numeric type before including it in the response.
Flag: any endpoint returning `total` without an explicit numeric conversion where the source is a database count query.

---

## Step 4 - Validation consistency check (main context)

Derive the list of write routes dynamically:

For each write endpoint, read the handler. Verify:

**V1 - Validation schema completeness**
Check that the validation schema for each POST/PATCH handler includes all NOT NULL, no-default columns as required fields. Flag any NOT NULL column missing from the validation schema.

**V2 - Consistent validation placement**
Check that validation always happens BEFORE any DB query (not after a partial DB read). Flag: any handler that reads from DB before validating input.

**V3 - Validation error response**
Check that validation failures return `status: 400` with field-level error detail - not just a generic "bad request".
Verify error details are accessed via the validation library's documented property (see PATTERNS.md → V3).
Preferred response shape: `{ error: 'Validation failed', issues: [...field-level details...] }` - include per-field error information for form-facing endpoints.

---

## Step 5 - Produce report and update backlog

Generate the report using the template in `${CLAUDE_SKILL_DIR}/REPORT.md`. Apply the severity guide and backlog writing rules from the same file.

---

## Execution notes

- **Mode: audit / remediation**: Do NOT make any route changes.
- **Mode: apply**: make only non-breaking, focused fixes (e.g. 200→201, `{ error: issues }` → `{ error: 'Invalid data', issues }`). Flag every breaking change explicitly before touching it. Do not rewrite handler logic.
- Do NOT audit auth implementation (covered by `/security-audit`).
- If a pattern is used consistently project-wide (even if non-standard), note it as "consistent but non-standard" - don't flag as a violation unless it causes actual client-side issues.
- Evidence standard: every non-trivial finding must cite `file:line - excerpt`. Do not draw broad conclusions from a single isolated endpoint.
- After the report, ask: "Do you want me to align the endpoints that show inconsistencies?" (only in audit/remediation mode) or summarize changes made (apply mode).
