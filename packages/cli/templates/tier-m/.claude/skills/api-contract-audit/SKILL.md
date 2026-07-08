---
name: api-contract-audit
description: Static OpenAPI contract audit - endpoint drift (spec vs code), schema drift, status-code mismatch, breaking-change detection vs previous spec version, versioning consistency, security scheme alignment, deprecation markers, Richardson Maturity L0-L3 scoring. Framework auto-gen for FastAPI, NestJS, Express+swagger-jsdoc, Next.js route handlers, Django REST.
user-invocable: true
model: sonnet
context: fork
argument-hint: [target:spec:<path>|target:endpoint:<path>|mode:drift|mode:richardson|mode:all]
allowed-tools: Read Glob Grep Bash(curl:*) Bash(git:*)
---

## Scope for v1

- **Static analysis only.** Parses OpenAPI spec files on disk or auto-generated output captured from the running dev server. Does not execute request traffic against endpoints, does not diff runtime responses, does not validate live SLAs.
- **Richardson Maturity Model L0-L3.** L0 (RPC over HTTP), L1 (resource URLs), L2 (correct HTTP verbs), L3 (HATEOAS). L3 detection is best-effort via response-schema inspection for `_links`, `rel`, `href`, JSON:API, or HAL patterns.
- **Spec diff requires git history.** Breaking-change detection compares the current spec vs the previous committed version via `git show HEAD~1:<spec-path>`. Falls back to no-diff mode when git history is unavailable.

---

## Configuration (adapt before first run)

> Replace these placeholders:
> - `[OPENAPI_SPEC_PATH]` - location of the OpenAPI spec if committed on disk (e.g. `openapi.yaml`, `api/openapi.json`, `docs/openapi.yaml`). Leave empty to rely on framework auto-gen.
> - `[API_SOURCE_PATH]` - path to API route handlers (e.g. `src/routes/`, `app/api/`, `src/controllers/`).
> - `[DEV_SERVER_URL]` - optional, for framework auto-gen fallback (e.g. `http://localhost:3000`). Leave empty to skip runtime spec fetch.

---

## Step 0 - Target and mode resolution

Parse `$ARGUMENTS` for `target:` and `mode:` tokens.

| Pattern | Meaning |
|---|---|
| `target:spec:<path>` | Audit a specific spec file (`target:spec:api/v2.yaml`) |
| `target:endpoint:<path>` | Audit a single endpoint path (`target:endpoint:/users/{id}`) |
| `mode:drift` | Run only AC1-AC3 (endpoint / schema / status drift) |
| `mode:richardson` | Run only AC8 (Richardson Maturity scoring) |
| `mode:all` / no argument | **Full audit (AC1-AC8).** |

**STRICT PARSING**: derive target ONLY from explicit text in `$ARGUMENTS`. Do NOT infer from conversation context.

Announce: `Running api-contract-audit - scope: [FULL | target: <resolved>] - mode: <resolved>`

---

## Step 1 - Spec discovery

Attempt sources in this order. First hit wins.

1. **Explicit target**: if `target:spec:<path>` was passed, use that path verbatim.
2. **Static file**: try `[OPENAPI_SPEC_PATH]`, then conventional paths: `openapi.yaml`, `openapi.json`, `openapi.yml`, `api/openapi.yaml`, `api/openapi.json`, `docs/openapi.yaml`, `docs/api/openapi.yaml`, `swagger.yaml`, `swagger.json`.
3. **Framework auto-gen**: detect framework via markers, then parse spec from source code. See `${CLAUDE_SKILL_DIR}/PATTERNS.md` → "Framework auto-gen":
   - **FastAPI**: `main.py` / `app/main.py` with `from fastapi import FastAPI`. If `[DEV_SERVER_URL]` is set: `curl -s $DEV_SERVER_URL/openapi.json`. Otherwise: parse `@app.{get,post,put,patch,delete}()` decorators and Pydantic model definitions.
   - **NestJS**: `nest-cli.json` or `@nestjs/core` in `package.json`. Parse `@ApiProperty`, `@ApiResponse`, `@ApiOperation` decorators + controller `@Controller`/`@Get`/`@Post` routes.
   - **Express + swagger-jsdoc**: `swagger-jsdoc` in `package.json` devDeps. Parse JSDoc `@swagger` annotations in source.
   - **Next.js 13+ route handlers**: `app/api/**/route.{ts,js}` + Zod schema imports. Infer endpoint methods from exported `GET`, `POST`, `PUT`, `DELETE`, `PATCH` handlers; infer request/response shape from Zod `.parse()` calls.
   - **Django REST Framework**: `drf-spectacular` or `drf-yasg` in `requirements.txt` / `pyproject.toml`. If dev server running: `curl -s $DEV_SERVER_URL/schema/`. Otherwise: parse `@extend_schema` decorators on ViewSets.

If no spec is discoverable: announce `No OpenAPI spec found. Set [OPENAPI_SPEC_PATH] or configure a supported framework (FastAPI / NestJS / Express+swagger-jsdoc / Next.js + Zod / Django REST).` and exit 0.

Update: `Spec source: <file | framework-autogen:<name>> - endpoints declared: <N>`.

---

## Step 2 - Route discovery in codebase

Glob `[API_SOURCE_PATH]` (default: `src/routes/`, `src/controllers/`, `app/api/`, `api/`, per framework convention). Extract each route handler with `(method, path, handler-function-name, file:line)` tuples.

Framework-specific glob patterns live in `${CLAUDE_SKILL_DIR}/PATTERNS.md` → "Route discovery". Respect `target:endpoint:` if provided.

Announce: `Routes declared in code: <M>`.

---

## Step 3 - Contract drift checks (AC1-AC8)

Run each check. Record findings as SEVERITY / CHECK / FILE:LINE or SPEC:PATH / EVIDENCE / IMPACT / FIX.

### AC1 - Endpoint drift (spec vs code)

**Critical per orphan with active consumers; High otherwise.**

Build two sets: `SpecEndpoints = { (method, path) }` from Step 1; `CodeEndpoints = { (method, path) }` from Step 2.

- `CodeEndpoints - SpecEndpoints`: routes implemented but not in spec → clients cannot discover them → **High**.
- `SpecEndpoints - CodeEndpoints`: spec advertises endpoints with no handler → 404 for clients calling them → **Critical**.

Report each delta with method, path, and source evidence.

### AC2 - Schema drift (request / response field-level)

**High per mismatch.**

For each endpoint present in both sets, compare:

- Request body schema (spec) vs request validation schema in code (Zod / Pydantic / io-ts / class-validator). Flag fields in one but not the other; flag type mismatches (spec `string` but code `number`).
- Response body schema (spec) vs actual return shape. Heuristic: grep the handler body for `return` / `res.json(...)` / `Response.json(...)` and compare keys to spec.

Per-field accuracy is best-effort. Framework-specific schema extractors in `PATTERNS.md` → "Schema extraction".

### AC3 - HTTP status-code mismatch

**Medium per mismatch; High if the mismatch breaks documented contract (e.g. spec says 200, code returns 201).**

For each endpoint, list status codes declared in spec (`responses:` keys) vs status codes returned in handler body (grep for `res.status(N)`, `return { status_code: N }`, `HTTPException(status_code=N)`, `Response(status_code=N)`).

Flag codes returned in code but absent from spec (undocumented error paths) and codes declared in spec but never returned (stale documentation).

### AC4 - Breaking-change detection (vs previous spec)

**Critical per breaking change; Low informational for non-breaking changes.**

If git history available AND the spec is tracked in git:

```bash
git show HEAD~1:<spec-path> > /tmp/spec-prev.yaml 2>/dev/null
```

Diff old vs current. Flag as Critical:
- Required field removed from request schema
- Enum value removed from request enum
- Status code removed from responses
- Path removed or renamed (without `deprecated: true` marker in prior version)
- Type change on request field (string → int, array → object)
- Response field removed (clients depending on it break)

Non-breaking changes (new optional field added, new status code added, new endpoint added) are reported as **Low informational** to give visibility without blocking.

If git history unavailable or spec is not tracked in git: skip AC4 with `N/A - spec not tracked in git history`.

### AC5 - Versioning consistency

**Medium per inconsistency.**

If endpoints use path versioning (`/v1/...`, `/v2/...`): all endpoints in a single spec file should share the same major version prefix, or the spec title / `info.version` should match the dominant prefix.

If endpoints use header versioning or content-negotiation: AC5 skip with `N/A - non-path versioning detected`.

Flag mixed-version specs (e.g. spec containing both `/v1/users` and `/v2/orders` without clear separation).

### AC6 - Security scheme alignment

**High per mismatch.**

- Spec declares `securitySchemes` (e.g. `bearerAuth`, `apiKey`, `oauth2`). For each endpoint with an associated `security:` block, verify the corresponding auth middleware is applied in the route handler (grep for `requireAuth`, `@UseGuards(AuthGuard)`, `Depends(get_current_user)`, `permission_classes = [IsAuthenticated]`).
- Endpoints in code that apply auth middleware but are marked `security: []` (explicit no-auth) in spec: **High** - contract says public but code gates.

### AC7 - Deprecation markers

**Medium per stale deprecation.**

Endpoints marked `deprecated: true` in spec should either:
- Have a documented `Sunset:` header or an `x-sunset` extension field with a date.
- Be removed from code by the sunset date.

Flag endpoints deprecated > 180 days without sunset (stale deprecation) and endpoints with `deprecated: true` in spec but no deprecation warning / header in the handler code.

### AC8 - Richardson Maturity Model scoring (L0-L3)

Grade the overall API. Per-endpoint classification, then aggregate.

- **L0 - RPC over HTTP**: all endpoints use a single path with action verbs in the URL (`/api/doAction`, `/api/getUser`) and a single HTTP method (usually POST) for everything.
- **L1 - Resource URLs**: endpoints are resource-oriented (`/users`, `/orders/{id}`) but use inconsistent HTTP methods (POST to create, read, and update).
- **L2 - HTTP verbs**: resource-oriented URLs + correct verb mapping (GET reads, POST creates, PUT/PATCH updates, DELETE removes). Status codes are semantically correct. **Most mature APIs target L2.**
- **L3 - HATEOAS**: response bodies include navigational links (`_links`, `rel`, `href` conventions like HAL, JSON:API, or custom). Detection is best-effort via response schema inspection for objects containing `href` + `rel` or `_links` keys.

Report:

```
## Richardson Maturity
- Overall level: L<N>
- L0 endpoints: <count> (<percentage>%)
- L1 endpoints: <count>
- L2 endpoints: <count>
- L3 endpoints: <count>
- L3 detection method: response-schema inspection (best-effort)
```

L3 is informational - most well-designed REST APIs sit at L2 by choice, not limitation.

---

## Step 4 - Report

```
## API Contract Audit - [DATE] - [SCOPE] - source: [SPEC_SOURCE]

### Executive summary
[2-5 bullets. Critical and High findings only. Concrete facts: endpoint paths, field names, counts. If nothing Critical/High: state "Contract and code are aligned".]

### Contract maturity assessment
| Dimension | Rating | Notes |
|---|---|---|
| Endpoint alignment | strong / adequate / weak | [AC1 delta count] |
| Schema fidelity | strong / adequate / weak | [AC2 field mismatches] |
| Status-code discipline | strong / adequate / weak | [AC3 count] |
| Breaking-change hygiene | strong / adequate / weak | [AC4 count, N/A if git unavailable] |
| Versioning | strong / adequate / weak | [AC5 consistency] |
| Auth contract | strong / adequate / weak | [AC6 mismatches] |
| Deprecation discipline | strong / adequate / weak | [AC7 stale count] |
| Maturity (Richardson) | L0 / L1 / L2 / L3 | [AC8 overall level + distribution] |
| Release readiness | ready / conditional / blocked | [blocked = any Critical] |

### Check verdicts
| # | Check | Verdict | Findings |
|---|---|---|---|
| AC1 | Endpoint drift | OK / warn | [N orphans] |
| AC2 | Schema drift | OK / warn | [N field mismatches] |
| AC3 | Status-code mismatch | OK / warn | [N mismatches] |
| AC4 | Breaking changes | OK / warn / N/A | [N breaking, M non-breaking] |
| AC5 | Versioning consistency | OK / warn / N/A | [mixed / consistent] |
| AC6 | Security scheme alignment | OK / warn | [N mismatches] |
| AC7 | Deprecation markers | OK / warn | [N stale] |
| AC8 | Richardson Maturity | L0 / L1 / L2 / L3 | [distribution] |

### Prioritized findings
For each finding with severity Medium or above:
[SEVERITY] [ID] [check] - [file:line | spec:path] - [evidence] - [impact] - [fix] - [effort: S / M / L]

### Quick wins
[Findings meeting: (a) Medium or High, (b) effort S, (c) single-file fix]
Format: "API-[n]: [one-line description]"
If none: state explicitly.
```

---

## Step 5 - Backlog decision gate

Present all findings with severity Medium or above as a numbered decision list, sorted Critical → High → Medium:

```
Found N findings at Medium or above. Which to add to backlog?

[1] [CRITICAL] API-? - spec:/users/{id} - one-line description
[2] [HIGH]     API-? - src/users.ts:42 - one-line description
[3] [MEDIUM]   API-? - spec:/orders - one-line description
...

Reply with numbers to include (e.g. "1 2 4"), "all", or "none".
```

**Wait for explicit user response before writing anything.**

Then persist ONLY the approved entries via the backlog write-once protocol (`.claude/rules/backlog-protocol.md`) — in an active block append them to the session scratch; standalone, write them directly to `docs/refactoring-backlog.md`. Use the same entry format either way:
- Assign ID: `API-[n]` (next available after existing API entries)
- Add row to priority index
- Add full detail section: issue, evidence (file:line / spec:path + excerpt), fix, effort, risk

### Severity guide

- **Critical**: spec advertises endpoint with no handler (AC1); breaking change to required field / enum / path in spec diff (AC4)
- **High**: endpoint implemented but not in spec (AC1); schema drift on field type (AC2); status-code mismatch that breaks documented contract (AC3); auth middleware mismatch vs `securitySchemes` (AC6)
- **Medium**: undocumented error status code (AC3); versioning inconsistency (AC5); stale deprecation > 180 days without sunset (AC7)
- **Low**: non-breaking additive spec change (AC4); Richardson L0/L1 grading (AC8 - informational, grading is opinion-shaped)

---

## Execution notes

- Do NOT modify spec or handler code. Audit only.
- Framework auto-gen via `[DEV_SERVER_URL]` requires dev server running; skip gracefully if unreachable.
- This skill complements `/api-design` (forward-looking design review for new routes) and `/security-audit` (runtime auth enforcement). Run `/api-contract-audit` in Phase 5d Track B after Phase 3 passes, especially on blocks that modify API routes or the OpenAPI spec.
- AC4 breaking-change detection depends on the spec being tracked in git. Uncommitted specs or specs regenerated each build without commit cannot be diffed.
- After the report, ask: "Do you want me to prepare the corrections for the identified findings?" Reply with `yes` only after the user has signed off.

---

## Stack adaptation

Framework detection + auto-gen patterns live in `${CLAUDE_SKILL_DIR}/PATTERNS.md`. Covered v1 (ranked by coverage quality):

- **FastAPI** (python): native `/openapi.json` endpoint on dev server; decorator + Pydantic model parsing as offline fallback.
- **NestJS** (node-ts): `@ApiProperty` / `@ApiResponse` decorator parsing; highly accurate when decorators are complete.
- **Express + swagger-jsdoc** (node-js / node-ts): JSDoc `@swagger` annotation parsing; accuracy depends on annotation discipline.
- **Next.js 13+ route handlers** (node-ts): `app/api/**/route.ts` + Zod schema inference; accuracy depends on Zod usage for validation.
- **Django REST Framework** (python): `drf-spectacular` / `drf-yasg`; dev-server schema endpoint preferred, `@extend_schema` decorator parsing as fallback.

Other frameworks (Django vanilla, Flask without flask-restx, Ruby on Rails, Go chi / gin, Spring Boot): fall back to static-file-only mode - if no spec file is committed, the skill cannot audit.
