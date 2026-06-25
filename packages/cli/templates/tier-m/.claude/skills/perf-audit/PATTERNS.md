# Performance Audit - Stack Patterns

Reference file for `/perf-audit`. Contains framework/language-specific grep patterns.
The executing agent reads this file at the start of Step 2 (web) or Step 6 (native). Select patterns matching the detected stack.

---

# Web Performance Patterns

## B1 - Client-side rendering directives

| Framework | Client directive | Server default |
|---|---|---|
| Next.js | `'use client'` | Server Components |
| Nuxt 3 | `<script setup>` in pages (auto-client) | Server-first |
| SvelteKit | No directive (all components SSR by default) | SSR |
| Astro | `client:only`, `client:load`, `client:visible` | Static |
| Angular (SSR) | N/A (all client by default with SSR hydration) | Client |
| Remix | N/A (loaders are server, components are shared) | Shared |

## B3 - Client-side lifecycle hooks (data fetching)

| Framework | Lifecycle hooks to flag |
|---|---|
| React / Next.js | `useEffect(` with fetch/query inside |
| Vue / Nuxt | `onMounted(` with fetch inside |
| Svelte / SvelteKit | `onMount(` with fetch inside |
| Angular | `ngOnInit(` with HTTP call inside |
| Generic | Any client-side lifecycle hook containing a data fetch call |

## B9 - Lazy loading mechanisms

| Framework | Dynamic import pattern |
|---|---|
| React | `React.lazy(`, `lazy(` from react |
| Next.js | `next/dynamic`, `dynamic(` |
| Vue / Nuxt | `defineAsyncComponent(`, `() => import(` |
| Svelte | `{#await import(` |
| Angular | `loadComponent:`, `loadChildren:` (route-level) |
| Generic | `import(` (dynamic import expression) |

## P1 - Bundle analyzer tools

| Build tool | Analyzer |
|---|---|
| Webpack | `webpack-bundle-analyzer`, `@next/bundle-analyzer` |
| Vite | `rollup-plugin-visualizer` |
| Next.js 16+ | `npx next experimental-analyze` (built-in) |
| Rollup | `@rollup/plugin-visualizer` |
| esbuild | `esbuild-visualizer` |

## Q2 - Select-all / over-fetch patterns

| ORM / Client | Pattern |
|---|---|
| SQL (any) | `SELECT *` |
| Supabase JS | `.select('*')`, `.select(\`*\`)` |
| Prisma | `findMany()`, `findFirst()` without `select:` |
| Django ORM | `.all()`, `.filter(` without `.only(` or `.values(` |
| SQLAlchemy | `session.query(Model).all()` without column projection |
| ActiveRecord | `.all`, `.find(` without `.select(` |
| Sequelize | `.findAll()` without `attributes:` |
| Drizzle | `select()` without explicit column list |
| Go (sqlx) | `Select(&`, `Get(&` - check struct for unused fields |

---

# Native / Backend Performance Patterns

## Step 6b - Language-specific checks

### Swift

| Check | Grep pattern | Flag condition |
|---|---|---|
| Main-thread work | `DispatchQueue.main.sync` outside UI layer files | Synchronous dispatch on main blocks UI |
| Main-thread network | `URLSession.shared.data` without `Task { }` wrapper | Blocking network call |
| Image downsampling | `UIImage(named:` or `NSImage(named:` in collection/table view code | No `preparingThumbnail` or `CGImageSource` downsampling nearby |
| Core Data batch size | `NSFetchRequest` without `fetchBatchSize` set | Default fetches all objects into memory |
| Retain cycles | `{ self.` or `{ [self]` without `[weak self]` | In long-lived contexts (completion handlers, observers, timers) |
| Allocation spikes | `= String(`, `= Data(`, `= NSMutableAttributedString(` inside loops | Object creation per iteration |

### Kotlin

| Check | Grep pattern | Flag condition |
|---|---|---|
| Main-thread DB | `Room` or `SQLite` calls outside `Dispatchers.IO` / `withContext(Dispatchers.IO)` | DB access on main thread |
| RecyclerView recycling | `inflate(` inside `onBindViewHolder` | View inflation in bind instead of `onCreateViewHolder` |
| Bitmap memory | `BitmapFactory.decode` without `inSampleSize` | Full-resolution bitmap load |
| Coroutine leaks | `GlobalScope.launch` | No lifecycle-aware cancellation |
| StrictMode | `StrictMode` absence in Application class | Disk/network violations on main thread go undetected |

### Rust

| Check | Grep pattern | Flag condition |
|---|---|---|
| Unnecessary clone | `.clone()` where value is only read after | Borrow would suffice |
| Hot-path allocation | `Vec::new()`, `String::new()`, `Box::new(` inside loops | Allocation could be hoisted or reused |
| Dynamic dispatch | `Box<dyn` with single implementor | Generics avoid vtable overhead |
| Missing inline | `pub fn` in hot-path modules with body < 5 lines | Consider `#[inline]` |

### Go

| Check | Grep pattern | Flag condition |
|---|---|---|
| Goroutine in loops | `go func\|go ` inside `for` loop | No semaphore or worker pool — unbounded goroutine creation |
| Goroutine leak | `go func()` without `ctx.Done()\|context.WithCancel\|wg.Done()` nearby | Goroutine has no cancellation path or wait group tracking |
| Channel sizing | `make(chan` with no capacity argument | Unbuffered channel in producer-consumer causes synchronous blocking |
| Defer in loops | `defer` inside `for` | Deferred calls accumulate until the enclosing function returns, not the loop iteration |
| Escape analysis | `go build -gcflags='-m' 2>&1 \| grep 'escapes to heap'` | Hot-path heap escapes — check `interface{}` in loops, `fmt.Sprintf` in hot path |
| fmt in hot path | `fmt\.Sprintf\|fmt\.Fprintf` in tight loops | Use `strconv.Itoa`, `strconv.AppendInt`, or `strings.Builder` instead |
| HTTP client timeout | `http\.Get(\|http\.Client{}` without `Timeout:` field | No timeout on HTTP client — hangs on slow/unreachable endpoints |
| Map preallocation | `make(map\[` without size hint, `append(` to nil slice in loops | Use `make(map[K]V, n)` and `make([]T, 0, n)` when count is known |
| DB connection pool | `db\.SetMaxOpenConns(0)\|sql\.Open(` without `SetMaxOpenConns\|SetConnMaxLifetime` | Unlimited or unconfigured connection pool |
| pprof exposure | `_ "net/http/pprof"` import | pprof endpoint active in production binary — exposes heap, goroutine, and CPU data |

### Python

| Check | Grep pattern | Flag condition |
|---|---|---|
| Regex in loops | `re.compile` or `re.search`/`re.match` with literal pattern inside `for`/`while` | Constant pattern - compile once outside loop |
| List vs generator | `[... for ... in ...]` passed to `sum(`, `max(`, `min(`, `any(`, `all(` | Generator expression avoids materializing full list |
| Deep copies | `copy.deepcopy` in hot paths | Extremely expensive |
| GIL contention | `threading.Thread` doing CPU-bound work | Use `multiprocessing` or `ProcessPoolExecutor` |

### Ruby

| Check | Grep pattern | Flag condition |
|---|---|---|
| N+1 queries | `.each` followed by association access (e.g. `user.company`) | No `.includes(` or `.eager_load(` on parent query |
| String allocation | `"#{` inside loops | Build with `StringIO` or array join instead |
| GC pressure | `.map { \|x\| x.` creating intermediate arrays | `.lazy.map` or `.each_with_object` avoids allocation |

### Java

| Check | Grep pattern | Flag condition |
|---|---|---|
| Autoboxing | `Integer`, `Long`, `Double` in loop variable declarations | Use primitive types |
| String concat in loops | `+=` on String inside loops | Use `StringBuilder` |
| Connection pool | `DriverManager.getConnection` without pool | Configure HikariCP or equivalent |
| Stream overhead | `.stream().` on small collections (< 10 items) | Traditional loop may be faster |

### .NET

| Check | Grep pattern | Flag condition |
|---|---|---|
| LINQ allocations | `.Select(`, `.Where(`, `.ToList()` chains | Intermediate `.ToList()` materializes unnecessarily |
| String concatenation | `+=` on string inside loops | Use `StringBuilder` or `string.Join` |
| LOH fragmentation | `new byte[` with size > 85000 | Large Object Heap allocations expensive to collect |
| Async overhead | `async` methods with single `await`, no branching | Remove async wrapper to avoid state machine overhead |

---

## NR1 - Entry point patterns

| Language | Entry point |
|---|---|
| Swift | `@main` struct or `AppDelegate.didFinishLaunchingWithOptions` |
| Kotlin | `Application.onCreate` or `MainActivity.onCreate` |
| Rust / Go / Python / Ruby / Java / .NET | `main()` function or entry module |

## NR2 - Memory management patterns

| Language | Pattern | Flag condition |
|---|---|---|
| Swift | Missing `autoreleasepool` in batch processing loops | Memory spikes |
| Swift | `NSCache` or `Dictionary` as cache without size limit | Unbounded memory growth |
| Kotlin | `static` or `companion object` holding Activity/Context | Memory leak |
| Kotlin | Missing listener/observer cleanup in `onDestroy` | Leak |
| Rust | `Vec` growing via `push` without `with_capacity` | Repeated reallocation |
| Go | `sync.Map` or map growth without periodic cleanup | Unbounded maps |
| All | Large static/global collections persisting for process lifetime | Permanent memory |

## NR3 - Energy / background patterns (mobile only)

| Language | Pattern | Flag condition |
|---|---|---|
| Swift | `Timer.scheduledTimer` without `tolerance` | Tight timers prevent CPU sleep |
| Swift | `CLLocationManager.startUpdatingLocation` | Use `startMonitoringSignificantLocationChanges` if sufficient |
| Kotlin | `AlarmManager.setRepeating` or `Handler.postDelayed` in loops | Excessive wake-ups |
| Kotlin | `LocationRequest` with high frequency | Reduce update interval |
| All | Repeated network calls on a timer | Use push notifications or event-driven updates |
