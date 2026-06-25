# API Contract Audit - Patterns

Reference file for `/api-contract-audit`. Framework markers, auto-gen sources, route globs, schema extractors, and L3 HATEOAS detection patterns.
The executing agent reads this at Step 1 (framework detection), Step 2 (route discovery), and AC2 / AC8. Sections are grouped by framework.

---

## Framework auto-gen

### FastAPI (python)

**Markers**:
- `from fastapi import FastAPI` in any `*.py`
- `main.py`, `app/main.py`, `app.py` with `FastAPI()` instantiation

**Spec source** (priority order):
1. Runtime: `curl -s $DEV_SERVER_URL/openapi.json` (FastAPI serves native OpenAPI at this path by default).
2. Offline decorator parsing: `@app\.(get|post|put|patch|delete)\(['"](?P<path>[^'"]+)['"]\)` → method + path; handler function following decorator → handler name.
3. Response schema: `response_model=<PydanticClass>` argument in decorator.

**Request schema extraction**: inspect function signature for Pydantic model parameters: `def handler(payload: <PydanticClass>)`.

### NestJS (node-ts)

**Markers**:
- `@nestjs/core` in `package.json` dependencies
- `nest-cli.json` at project root

**Spec source** (priority order):
1. Runtime: if `SwaggerModule.setup('api', app, document)` is called (grep source): `curl -s $DEV_SERVER_URL/api-json`.
2. Offline decorator parsing: `@Controller\(['"]?(?P<prefix>[^'"]*)['"]?\)` → controller prefix; `@(Get|Post|Put|Patch|Delete)\(['"]?(?P<path>[^'"]*)['"]?\)` → method + relative path.

**Request schema**: DTO class annotated with `@ApiProperty()` on each field. Extract field name + type from TypeScript types.

**Response schema**: `@ApiResponse({ status: N, type: <DtoClass> })` above handler.

### Express + swagger-jsdoc (node-js / node-ts)

**Markers**:
- `swagger-jsdoc` in `package.json` devDependencies
- JSDoc blocks with `@swagger` annotation in source

**Spec source** (priority order):
1. Runtime if `swagger-ui-express` is mounted: `curl -s $DEV_SERVER_URL/api-docs/swagger.json`.
2. Offline: parse JSDoc `@swagger` blocks. Each block is YAML under the comment.

**Route extraction**: `router.(get|post|put|patch|delete)\(['"](?P<path>[^'"]+)['"]` or `app.(get|post|...)` pattern.

### Next.js 13+ route handlers (node-ts)

**Markers**:
- `app/api/**/route.{ts,js}` files exist
- Exports match `export async function (GET|POST|PUT|PATCH|DELETE)`

**Spec source**: no runtime spec endpoint by default. Infer spec from:

- File path → endpoint path: `app/api/users/[id]/route.ts` → `/api/users/{id}`
- Exported handler names → HTTP methods: `export async function GET` → `GET`
- Zod schema usage in handler body → request/response shape: `const body = schema.parse(await req.json())` → extract `schema` definition from imports.

**Schema extraction**: Zod schemas (`z.object({ ... })`) traversed to produce an inferred JSON schema per endpoint. Best-effort on complex compositions.

### Django REST Framework (python)

**Markers**:
- `drf-spectacular` or `drf-yasg` in `requirements.txt` / `pyproject.toml`
- `rest_framework` in `INSTALLED_APPS` in `settings.py`

**Spec source** (priority order):
1. Runtime via `drf-spectacular`: `curl -s $DEV_SERVER_URL/schema/` (default path) or `curl -s $DEV_SERVER_URL/api/schema/`.
2. Offline: parse `@extend_schema(request=<Serializer>, responses={200: <Serializer>})` decorators on ViewSets.
3. Fallback: parse `urls.py` for `path(...)` / `re_path(...)` entries + ViewSet method names.

---

## Route discovery (code side)

Globs per framework. Used in Step 2 when the spec discovery above yields an endpoint list - this side produces the code-side set for AC1 set-diff.

| Framework | Glob | Pattern |
|---|---|---|
| **FastAPI** | `**/*.py` | `@(app\|router)\.(get\|post\|put\|patch\|delete)\(['"]([^'"]+)['"]` |
| **NestJS** | `src/**/*.controller.ts` | `@(Get\|Post\|Put\|Patch\|Delete)\(` inside class decorated with `@Controller\(` |
| **Express** | `src/routes/**/*.{ts,js}`, `routes/**/*.{ts,js}` | `(router\|app)\.(get\|post\|put\|patch\|delete)\(['"]` |
| **Next.js** | `app/api/**/route.{ts,js}` | File presence + exported handler names (`GET`, `POST`, ...) |
| **DRF** | `**/urls.py`, `**/views.py` | `path\(['"]`, `re_path\(['"]`, `class .+ViewSet` |

---

## Schema extraction (AC2)

Per-framework parsers for field-level schema comparison.

- **FastAPI / Pydantic**: parse `class X(BaseModel): field: <type> = <default>`. Types: `str → string`, `int → integer`, `bool → boolean`, `list[Y] → array`, `Optional[Y] → nullable Y`.
- **NestJS / class-validator**: parse class with `@ApiProperty({ type: ..., required: ... })` decorators. Alternative: use `@IsString()`, `@IsNumber()`, `@IsOptional()` decorators as schema hints.
- **Zod** (Express / Next.js): traverse `z.object({...})` - `z.string() → string`, `z.number() → number`, `z.array(...) → array`, `z.optional(...) → optional`.
- **DRF serializers**: parse `class XSerializer(serializers.Serializer): field = serializers.CharField(required=...)` - mapping from DRF field types to JSON schema types.

Depth: one level deep. Nested object comparison is best-effort; complex compositions (unions, discriminated unions, refinements) may produce false positives flagged as `probable`.

### Go (gin / chi / echo + swaggo / oapi-codegen)

**Markers**:
- `github.com/gin-gonic/gin` in `go.mod` → gin
- `github.com/go-chi/chi` in `go.mod` → chi
- `github.com/labstack/echo` in `go.mod` → echo
- `github.com/swaggo/swag` in `go.mod` → swaggo annotations present
- `github.com/oapi-codegen/oapi-codegen` or `github.com/deepmap/oapi-codegen` in `go.mod` → generated spec

**Spec source** (priority order):
1. Committed spec file: `openapi.yaml`, `openapi.json`, `api/openapi.yaml`, `docs/swagger.yaml`.
2. swaggo generated: `docs/swagger.json` or `docs/docs.go` (look for `// @title` annotations in source).
3. oapi-codegen generated: spec file passed to `oapi-codegen` (usually `api.yaml` or `spec/openapi.yaml`).
4. Infer from source: use route extraction below.

**Route extraction by router**:

| Router | Route registration pattern |
|---|---|
| gin | `r\.(GET\|POST\|PUT\|PATCH\|DELETE)\s*\(\s*"(?P<path>[^"]+)"` |
| gin RouterGroup | `v1\.(GET\|POST\|...)\s*\(\s*"(?P<path>[^"]+)"` |
| chi | `r\.(Get\|Post\|Put\|Patch\|Delete)\s*\(\s*"(?P<path>[^"]+)"` |
| echo | `e\.(GET\|POST\|PUT\|PATCH\|DELETE)\s*\(\s*"(?P<path>[^"]+)"` |

**swaggo annotation extraction**:

Grep for `// @Router` comments:
```
// @Router /path [method]
// @Summary Short description
// @Param name in type required "description"
// @Success 200 {object} ResponseType
```

Extract path + method from `@Router`, request body from `@Param body`, response type from `@Success`.

---

## L3 HATEOAS detection (AC8)

Inspect response schemas in the spec for HATEOAS markers:

- **HAL** (Hypertext Application Language): response object contains `_links: { self: { href: ... }, next: { href: ... }, ... }`. Schema field `_links` with nested objects containing `href`.
- **JSON:API**: response object contains `data: { ..., links: { self: ... } }` or top-level `links`. Schema has `links` field with object containing `self` / `related`.
- **Custom HATEOAS**: response contains an object with `href` + `rel` properties (any nesting). Grep schema for field pairs matching `"href"` and `"rel"` in the same object.

Threshold: flag an endpoint as L3 if > 30% of its response paths contain one of the above patterns. Conservative by design - most APIs claiming HATEOAS only ship a partial implementation.

Aggregate: overall API level = max level reached by ≥ 50% of endpoints. Skew to L2 if L3 is partial.

---

## Notes for future frameworks

When adding a new framework to Step 1 auto-gen:

1. Add a section above with Markers, Spec source, Schema extraction subsections.
2. Add a row to the Route discovery table.
3. Extend Step 1 announcement in `SKILL.md` to include the new framework.
4. Test the framework detection against a scaffolded project + a real-world sample.

Static-file-only is always the fallback. Frameworks that don't ship auto-gen (Ruby on Rails without rswag, Go chi without automatic OpenAPI middleware, Spring Boot without springdoc) will simply use `[OPENAPI_SPEC_PATH]` if committed, or be unsupportable if not.
