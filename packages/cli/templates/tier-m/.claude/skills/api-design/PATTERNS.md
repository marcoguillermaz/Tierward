# API Design Audit - Stack Patterns

Reference file for `/api-design`. Contains grep patterns per check, organized by stack.
The executing agent reads this file at the start of Step 2. For each check, select the patterns matching the detected stack. If no exact match, use Generic.

---

## N3 - JSON response helper patterns

Grep for these to find all route response calls.

| Stack | Response pattern |
|---|---|
| Next.js | `NextResponse.json(\|Response.json(` |
| Express | `res.json(\|res.send(` |
| Fastify | `reply.send(\|reply.code(` |
| Hono | `c.json(` |
| Django / DRF | `JsonResponse(\|Response(\|return Response(` |
| Flask | `jsonify(\|make_response(` |
| Rails | `render json:\|render(json:` |
| Laravel | `response()->json(\|return response(` |
| Go (net/http) | `json.NewEncoder\|w.Write(\|json.Marshal` |
| Go (Gin) | `c.JSON(\|c.IndentedJSON(` |
| Swift (Vapor) | `return .ok(\|try await req.content` |
| Kotlin (Ktor) | `call.respond(\|call.respondText(` |
| Java (Spring) | `ResponseEntity\|@ResponseBody` |
| .NET | `Ok(\|JsonResult\|Results.Json(` |
| Generic | `json\|JSON\|respond\|response\|send` |

---

## N6 - Validation error access patterns

After catching a validation error, the error details must be accessed via the library's correct property - not a similar-but-wrong name.

| Library | Correct access | Common mistake |
|---|---|---|
| Zod | `.error.issues` | `.error.errors` (returns `undefined` silently) |
| Joi | `.error.details` | `.error.errors` or `.error.message` (loses field-level detail) |
| class-validator | `errors` array from `validate()` | Accessing `.message` directly |
| Django / DRF | `serializer.errors` | `.error_list` (Form-only, not serializer) |
| Marshmallow | `err.messages` | `.errors` (different structure) |
| Go (validator) | `err.(validator.ValidationErrors)` | Treating as plain `error` |
| Java (Spring) | `BindingResult.getFieldErrors()` | `getGlobalErrors()` only |

### Zod-specific grep

Grep: `zodResult\.error\.errors|err\.errors|parseResult\.error\.errors|\.error\.errors`
Expected: 0 matches. All ZodError access must use `.issues`.

---

## N6b - Async params access

Some frameworks require async handling of route params. This check is framework-conditional.

| Framework | Condition | Grep pattern |
|---|---|---|
| Next.js 15+ | Always (params are Promise) | `params` destructured without `await` |
| SvelteKit | In `load` functions (params are sync, but data is async) | N/A for params |
| Nuxt 3 | `useRoute().params` is sync | N/A |
| Other frameworks | Params are synchronous | Skip this check |

---

## N8 - Throwing vs non-throwing validation patterns

| Library | Non-throwing (correct) | Throwing (flag if unhandled) |
|---|---|---|
| Zod | `safeParse(\|safeParseAsync(` | `.parse(\|.parseAsync(` |
| Joi | `validate(\|validateAsync(` | `assert(` |
| class-validator | `validate(` (returns errors array) | `validateOrReject(` |
| Django / DRF | `serializer.is_valid()` (returns bool) | `serializer.is_valid(raise_exception=True)` |
| Marshmallow | `schema.load(` with try/except | `schema.load(` without error handling |
| Go (validator) | `validate.Struct(` (returns error) | N/A (Go always returns errors) |
| Java (Spring) | `@Valid` + `BindingResult` param | `@Valid` without `BindingResult` (throws 400 automatically) |

---

## N9 - Request body parsing patterns

Grep for these to find where route handlers parse the request body.

| Stack | Body parsing call |
|---|---|
| Next.js | `request.json()\|req.json()` |
| Express | `req.body` (parsed by middleware) |
| Fastify | `request.body` (parsed by schema) |
| Django / DRF | `request.data\|request.POST` |
| Flask | `request.get_json()\|request.json\|request.form` |
| Rails | `params\|request.body` |
| Laravel | `$request->all()\|$request->input()\|$request->json()` |
| Go (net/http) | `json.NewDecoder(r.Body).Decode(\|io.ReadAll(r.Body)` |
| Swift (Vapor) | `req.content.decode(` |
| Kotlin (Ktor) | `call.receive<\|call.receiveNullable<` |
| Java (Spring) | `@RequestBody` (parsed by framework) |
| .NET | `[FromBody]\|Request.ReadFromJsonAsync(` |
| Generic | `body\|json()\|decode\|parse` |

---

## Go - API conventions

Go-specific API design checks. Apply when `Language: Go` is detected in CLAUDE.md.

| Check | What to look for | Flag condition |
|---|---|---|
| Status codes | `http.StatusOK` on POST handlers | POST creating a resource must return `http.StatusCreated` (201); DELETE with no body must return `http.StatusNoContent` (204) |
| Error shape consistency | Mix of `map[string]string{"error": ...}` and `map[string]interface{}{"message": ...}` | All error responses must share one schema — `{"error": string, "code": string}` |
| RESTful URL conventions | Grep handler registrations for verb-in-path: `router.GET.*\/create\|router.POST.*\/delete\|router.GET.*\/update` | Verbs in URL path — use nouns + HTTP method instead |
| Pagination consistency | Mix of `limit`/`offset`, `page`/`size`, and cursor patterns across handlers | All list endpoints must use the same pagination strategy |
| Content-Type negotiation | `w.Header().Set("Content-Type"` absent before `json.NewEncoder` | Every JSON response must set `Content-Type: application/json` explicitly |
| Idempotency on POST | Absence of idempotency key handling on POST endpoints that mutate state | Consider `Idempotency-Key` header for non-idempotent POST endpoints |
| API versioning | Mix of URL versioning (`/v1/`) and no versioning | All routes should follow one consistent versioning strategy |

---

## V3 - Validation error detail property

When returning validation errors to the client, use the library's documented property for field-level details.

| Library | Detail property | Example response shape |
|---|---|---|
| Zod | `.issues` | `{ error: 'Validation failed', issues: zodError.issues }` |
| Joi | `.details` | `{ error: 'Validation failed', issues: joiError.details }` |
| Django / DRF | `.errors` (serializer) | `{ error: 'Validation failed', issues: serializer.errors }` |
| Marshmallow | `.messages` | `{ error: 'Validation failed', issues: err.messages }` |
| Go (validator) | `.(validator.ValidationErrors)` | `{ error: "Validation failed", issues: [...] }` |
| Java (Spring) | `.getFieldErrors()` | Standard `ProblemDetail` with `errors` array |
| .NET | `ModelState` entries | Standard `ValidationProblemDetails` |
