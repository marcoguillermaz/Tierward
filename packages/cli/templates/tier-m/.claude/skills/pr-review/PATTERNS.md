# PATTERNS.md — `pr-review` per-stack severity criteria

Reference file for the `pr-review` skill. Loaded conditionally when the detected stack matches one of the entries below. The patterns extend the universal severity defaults in `SKILL.md` — they do not replace them. Project-level overrides in `team-settings.json` `prReviewSeverity` apply on top of both universal + stack patterns.

For stacks not listed (`node-js`, `go`, `ruby`, `rust`, `kotlin`, `java`, `dotnet`, `generic`), the skill body uses the universal defaults only and the report flags "v0 audit, contribute patterns to improve confidence."

---

## node-ts (TypeScript / JavaScript on Node.js)

### Critical — blocks merge

- RLS policy bypass: a query that should respect row-level security uses an admin / service-role client without an explicit caller-identity check. Common in Supabase, Postgres-with-RLS, Pocketbase admin tokens.
- Service-role / admin key referenced in client code (file with `'use client'` directive in Next.js, or otherwise tagged for browser bundling)
- `process.env.<SECRET>` value sent to the response body, written to a log line, or interpolated into a JSX expression
- Generated column written on a write (e.g. `auth.identities.email` UPDATE in Supabase) — fails at runtime
- React Server Component dispatching a write directly without going through a server action / API route with auth gating
- Cookie set with sensitive token and missing `httpOnly: true` + `secure: true` + appropriate `sameSite`
- Event handler or RPC handler executing `eval`, `Function(...)`, or `child_process.exec` with user input
- Migration that drops / renames a column without a documented rollback comment block
- API route accepting `FormData` or JSON without Zod (or equivalent) validation on the body

### Major — should be resolved before merge

- API route missing input validation (Zod / Valibot / Yup schema absent on POST/PATCH body)
- `useEffect` performing initial data fetching when a server component would do
- New table without `ALTER TABLE t ENABLE ROW LEVEL SECURITY` (or equivalent declaration)
- A new email-sending path without `.catch(() => {})` (must be fire-and-forget)
- Test that asserts DB state synchronously without `waitForResponse` / `findBy` / equivalent (e2e flake)
- Deeply mutable shared state in a server context (top-level `let` reassigned in a request handler)
- Module-level side effect that runs on import in a Next.js / Vite / similar build system
- Type assertion to bypass `tsc` on data from an external source without runtime validation

### Minor — backlog

- `@ts-ignore` / `@ts-expect-error` left without justification comment
- ESLint disable comment without justification
- Unused export from a barrel file

### Project conventions to respect (do NOT flag)

- Italian / non-English UI strings if `CLAUDE.md` declares a non-English product UI language. Code identifiers stay English.
- Service-role client use in API routes when the route itself enforces auth (intentional RLS bypass)
- `'use client'` directive on form components and interactive UI
- ZodError uses `.issues` (Zod v4), not `.errors`
- `await params` in dynamic Next.js routes (Next 15+)

---

## python

### Critical — blocks merge

- SQL injection via f-string / `.format()` interpolation into raw SQL — must use parameterized queries
- Pickle deserialization of untrusted input
- `eval` / `exec` / `compile` on user-supplied content
- Hard-coded credentials (`os.environ` reference followed by a literal fallback secret)
- Django / Flask route missing `@login_required` / `@authentication_required` on a write endpoint
- ORM query bypassing tenant filter (e.g., `Model.objects.all()` where `.filter(user=request.user)` is required)
- Raw HTML rendered in a template without `escape` / `mark_safe` audit
- Missing CSRF protection on a state-changing endpoint
- New table / migration without referential constraints declared

### Major — should be resolved before merge

- Endpoint missing pydantic / marshmallow / dataclass validation on the request body
- N+1 query on a hot path (missing `select_related` / `prefetch_related` / equivalent)
- Mutable default argument (`def f(x=[])`)
- Bare `except:` clause silencing all exceptions
- `subprocess.run` without `check=True` on a path where failure must propagate
- `print` left in a production code path (should be logger)
- Type annotation missing on a public function signature in a typed codebase
- Async fire-and-forget without `asyncio.create_task` + error logging

### Minor — backlog

- Dataclass field ordering inconsistent
- `# type: ignore` without justification
- Unused import

### Project conventions to respect

- Snake_case identifiers (PEP 8)
- Black / Ruff formatting differences (style only, not correctness)
- Domain-specific column names if `CLAUDE.md` declares non-English domain language

---

## swift

### Critical — blocks merge

- API key hard-coded as a string literal in source (must be in Keychain or build-time env)
- Force unwrap (`!`) on user-supplied data without prior `nil`-check
- `AnyObject` / `Any` cast on data from a network response without runtime type validation
- Sensitive token written to `UserDefaults` instead of Keychain
- Network request over HTTP (not HTTPS) on a non-localhost endpoint
- `URLSession.shared` used for a request that needs custom timeout / cookie / TLS configuration
- Background task without `endBackgroundTask(_:)` cleanup → app suspended in invalid state
- View hierarchy update outside the main actor (`@MainActor` violation)
- Missing biometric / passcode prompt on a sensitive flow (payment, identity, secrets)

### Major — should be resolved before merge

- `try!` on a path where the error should be surfaced to the user
- Force-unwrapped optional in a public API signature
- Concurrency: shared mutable state without `actor` / lock / serial queue
- Missing `Sendable` conformance on a type crossing actor boundaries (Swift 6+ strict concurrency)
- View struct holding a strong reference to a `Coordinator` / `Delegate` (potential retain cycle in MVVM)
- Test using `Thread.sleep` / `DispatchQueue.asyncAfter` instead of an `XCTestExpectation`
- Combine subscription not stored in `cancellables` (silent drop)
- SwiftUI view re-evaluating an expensive computation in `body` instead of `@State` / `@StateObject`

### Minor — backlog

- Implicit return on a single-expression function omitted
- Trailing closure not used where idiomatic

### Project conventions to respect

- UpperCamelCase for types, lowerCamelCase for variables / functions (Swift API guidelines)
- `Self.` qualifier preference per Swift API design guidelines
- Apple platform SDK preferences: `URLSession` over Alamofire, `Foundation.Date` over external date libs, unless `CLAUDE.md` declares an exception
- Xcode-driven project: warnings-as-errors enabled, no suppressed diagnostics

---

## go

### Critical — blocks merge

- **Unchecked error**: `_, err :=` or `:= someFunc()` with multi-return where `err` is `_` or not checked on the next line — silent failure path
- **SQL injection**: `fmt.Sprintf` / string concatenation used to build a query string passed to `db.Query`, `db.Exec`, or equivalent
- **Goroutine leak**: `go func()` without context cancellation path (`ctx.Done()` check or `wg.Done()`) inside a handler or long-lived function — leaks on request cancellation
- **Panic in production path**: `panic(` outside of `init()` or test helpers — unrecovered panics crash the server
- **Credentials in source**: hardcoded connection strings or API keys (e.g. `postgres://user:password@`)

### Major — should be resolved before merge

- **Error wrapping without `%w`**: `fmt.Errorf("...: " + err.Error())` or `errors.New(err.Error())` instead of `fmt.Errorf("...: %w", err)` — breaks `errors.Is` / `errors.As` unwrapping
- **Exported function without doc comment**: a public `func` or `type` declaration with no preceding `// FuncName ...` comment — required by `golint` and godoc convention
- **Nil map write**: assigning to a map field that may be `nil` (e.g. map declared with `var m map[K]V` then `m[key] = val`) — runtime panic
- **Context not propagated**: HTTP handler or repository function using `context.Background()` instead of the incoming `ctx` — prevents cancellation and tracing
- **`defer` inside loop**: `defer` call inside a `for` loop body — deferred calls accumulate until the enclosing function returns, not the iteration

### Minor — backlog

- **`fmt.Println` in production code**: debug output left in non-test files — use structured logger
- **Magic number without const**: raw numeric literals in business logic without a named constant
- **`interface{}` / `any` in public API**: untyped parameters or return values that weaken type safety without justification
- **Exported error variable not prefixed `Err`**: e.g. `var NotFound = errors.New(...)` instead of `var ErrNotFound = ...` (Go convention)

### Project conventions to respect

- `err` variable reuse with `:=` in the same scope is idiomatic Go (shadow assignment); do not flag
- `//nolint:` directives with a justification comment are acceptable
- Error strings are lowercase without trailing punctuation (Go convention) — do not flag
- `context.Background()` is correct in `main()` and `TestMain` — only flag in handler/repository code

---

## Other stacks (fallback)

For stacks not covered above (`node-js`, `go`, `ruby`, `rust`, `kotlin`, `java`, `dotnet`, `generic`), the skill body uses the universal severity defaults. The decision matrix and review structure still apply; what's missing is per-stack pattern recognition (specific framework idioms, language-specific anti-patterns).

When auditing one of these stacks, the skill's review report should include a footer noting:

> Stack `<name>` does not yet have curated PATTERNS.md severity rules. Falling back to universal defaults. Consider this a v0 review; the report may miss stack-specific anti-patterns. Submit a PR adding patterns for this stack to improve confidence.

This is honest signal-to-noise rather than pretending to a precision the audit doesn't have.
