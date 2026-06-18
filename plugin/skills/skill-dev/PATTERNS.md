# Code Quality Audit - Stack Patterns

Reference file for `/skill-dev`. Contains language-specific and framework-specific grep patterns.
The executing agent reads this file at the start of Step 2. Select patterns matching the detected stack. Checks without a matching pattern produce `N/A - skipped for <stack>`.

---

## DL1 - Language-specific lint and analysis checks

### Swift

| Check | Grep pattern | Flag condition |
|---|---|---|
| Force unwrap | `!` on optionals outside `guard`/`if let` | Crash risk on nil |
| SwiftLint patterns | Run `swiftlint lint` if available | Any warning/error |
| Retain cycle risk | `{ self.` or `{ [self]` without `[weak self]` | In closures stored by long-lived objects (completion handlers, observers, timers) |

### Kotlin

| Check | Grep pattern | Flag condition |
|---|---|---|
| Null safety violations | `!!` operator | Crash risk on null |
| Detekt patterns | Run `detekt` if available | Any warning/error |
| Coroutine scope leaks | `GlobalScope.launch`, `GlobalScope.async` | No lifecycle-aware cancellation |

### Rust

| Check | Grep pattern | Flag condition |
|---|---|---|
| Clippy warnings | `cargo clippy -- -W clippy::all` | Any warning |
| Unnecessary clone | `.clone()` where value is only read after | Borrow would suffice |
| Complex lifetimes | Lifetime annotations with 3+ parameters | Consider simplification or `Arc`/`Rc` |
| Unwrap in production | `unwrap()` outside test files | Panic risk on Err/None |

### Go

| Check | Grep pattern | Flag condition |
|---|---|---|
| Go vet | `go vet ./...` | Any finding |
| Unchecked errors | `errcheck` - return values of error-returning functions ignored | Silent failure |
| Staticcheck | `staticcheck ./...` | Any finding |
| Naked goroutines | `go func` or `go ` inside loops without context cancellation | Goroutine leak risk |

### Python

| Check | Grep pattern | Flag condition |
|---|---|---|
| Type hint coverage | Public functions (`def [^_]`) without type annotations | Missing return type or parameter types |
| Ruff/Pylint | Run `ruff check` or `pylint` if available | Any warning/error |
| Bare except | `except:` without exception type | Catches KeyboardInterrupt, SystemExit |
| Mutable default args | `def \w+\(.*=\s*(\[\]|\{\}|set\(\))` | Shared mutable default between calls |

### Ruby

| Check | Grep pattern | Flag condition |
|---|---|---|
| Rubocop patterns | Run `rubocop` if available | Any warning/error |
| Method length | Methods > 25 lines | Extract into smaller methods |
| Frozen string literal | Missing `# frozen_string_literal: true` at file top | Performance and mutation risk |

### Java

| Check | Grep pattern | Flag condition |
|---|---|---|
| SpotBugs patterns | Run `spotbugs` if available | Any finding |
| Unchecked casts | `(Type)` cast without `instanceof` check | ClassCastException risk |
| Empty catch swallowing | `catch\s*\(\w+\s+\w+\)\s*\{\s*\}` on checked exceptions | Silent failure on recoverable errors |
| Raw types | Generic types used without type parameters | Type safety loss |

### .NET

| Check | Grep pattern | Flag condition |
|---|---|---|
| Nullable warnings | `#nullable disable` or missing nullable annotations on public APIs | Null safety regression |
| IDisposable leak | `new \w+` on IDisposable types without `using` | Resource leak |
| Async void | `async void` methods (except event handlers) | Unobservable exceptions |

---

## D3 - Database query call patterns

| ORM / Client | Query method pattern |
|---|---|
| SQL (generic) | `.query(`, `.execute(`, `.raw(` |
| Supabase JS | `.from(`, `.select(`, `.insert(`, `.update(`, `.delete(`, `.rpc(` |
| Prisma | `.findMany(`, `.findFirst(`, `.findUnique(`, `.create(`, `.update(`, `.delete(` |
| Drizzle | `.select(`, `.insert(`, `.update(`, `.delete(`, `.from(` |
| Sequelize | `.findAll(`, `.findOne(`, `.create(`, `.update(`, `.destroy(` |
| TypeORM | `.find(`, `.findOne(`, `.save(`, `.remove(` |
| Django ORM | `.filter(`, `.get(`, `.all()`, `.create(`, `.update(`, `.delete(` |
| SQLAlchemy | `session.query(`, `session.execute(`, `.filter(`, `.all()` |
| ActiveRecord | `.where(`, `.find(`, `.find_by(`, `.all`, `.create(`, `.update(` |
| Eloquent | `::where(`, `::find(`, `::all()`, `::create(` |
| Go (sqlx/pgx) | `.Query(`, `.QueryRow(`, `.Exec(`, `.Get(`, `.Select(` |
| Rust (sqlx) | `sqlx::query(`, `sqlx::query_as(`, `.fetch(`, `.fetch_one(` |
| Swift (Core Data) | `NSFetchRequest`, `.fetch(`, `NSManagedObjectContext` |
| Swift (GRDB) | `.fetchAll(`, `.fetchOne(`, `.execute(` |
| Kotlin (Room) | `@Query`, `.dao.` method calls |

---

## D4 - Public API surface patterns (per language)

| Language | Public symbol pattern | Description |
|---|---|---|
| TypeScript / JavaScript | `export (function\|const\|type\|interface\|class)` | Exported declarations |
| Python | `def [^_]\w+\(` and `class [^_]\w+` at module level | Public functions/classes (no `_` prefix) |
| Swift | `public \|open ` declarations | Public/open access control |
| Go | Capitalized identifiers: `func [A-Z]`, `type [A-Z]`, `var [A-Z]` | Exported identifiers |
| Kotlin | `fun \|val \|var \|class ` without `private\|internal` modifier | Default-public declarations |
| Rust | `pub fn \|pub struct \|pub enum \|pub trait ` | Public items |
| Java | `public (class\|interface\|void\|static\|\w+)` | Public declarations |
| .NET | `public (class\|interface\|void\|static\|\w+)` | Public declarations |
| Ruby | `def \w+` at class level (no convention for private beyond `private` keyword) | Default-public methods |

---

## D8 - Type safety suppression patterns

### Pattern A - Directive suppressions

| Language | Suppression pattern | Severity note |
|---|---|---|
| TypeScript | `@ts-ignore` | Highest - silences all errors |
| TypeScript | `@ts-expect-error` | Acceptable only with description comment |
| TypeScript | `@ts-nocheck` | File-level suppression - always flag |
| Python | `# type: ignore` | Suppresses mypy/pyright checks |
| Java / Kotlin | `@SuppressWarnings` | Flag with specific warning type |
| Rust | `unsafe` blocks | Flag unless justified in comment |
| Go | `// nolint` | Suppresses linter checks |
| .NET | `#pragma warning disable` | Flag with specific warning code |

### Pattern B - Untyped escape hatches (TypeScript-specific)

| Pattern | Context |
|---|---|
| `:\s*any\b` | Type annotation as `any` |
| `as\s+any\b` | Type assertion to `any` |
| `<any>` | Generic type parameter as `any` |
| `Promise<any>` | Untyped promise |

Exclude: generated type files, vendor types, explicit exemptions in CLAUDE.md Known Patterns.

### Pattern C - Floating promises

Grep for async calls (DB queries, route navigation, API calls) that appear as bare statements without `await`, `void`, `return`, or error handling. These are silent fire-and-forget calls.

---

## D9 - Lifecycle/side-effect hook patterns

| Framework | Lifecycle hooks |
|---|---|
| React | `useEffect(` |
| Vue | `onMounted(`, `watch(`, `watchEffect(` |
| Svelte | `onMount(`, `$:` (reactive statements) |
| Angular | `ngOnInit(`, `ngOnChanges(`, `ngAfterViewInit(` |
| Swift (SwiftUI) | `.onAppear(`, `.task(`, `.onChange(` |
| Kotlin (Compose) | `LaunchedEffect(`, `DisposableEffect(`, `SideEffect(` |

---

## D10 - Debug output patterns

| Language | Debug output pattern |
|---|---|
| TypeScript / JavaScript | `console.log(`, `console.debug(`, `console.info(`, `console.warn(`, `console.error(` |
| Python | `print(` (at statement level, not inside format strings) |
| Swift | `print(` |
| Rust | `println!(`, `dbg!(`, `eprintln!(` |
| Go | `fmt.Println(`, `fmt.Printf(`, `fmt.Print(`, `log.Println(` |
| Ruby | `puts `, `p `, `pp ` |
| Java | `System.out.println(`, `System.err.println(` |
| Kotlin | `println(`, `print(` |
| .NET | `Console.WriteLine(`, `Console.Write(`, `Debug.WriteLine(` |
