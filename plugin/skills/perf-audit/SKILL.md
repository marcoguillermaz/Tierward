---
name: perf-audit
description: Performance audit: bundle size, lazy loading, data fetching, caching, N+1 queries, image optimization. Native mode checks memory, I/O, launch weight, energy.
user-invocable: true
model: sonnet
context: fork
argument-hint: [target:section:<section>|target:page:<route>|mode:audit|mode:apply]
---

## Configuration (adapt before first run)

> Replace these placeholders:
> - `[FRAMEWORK]` - e.g. `Next.js App Router`, `Remix`, `SvelteKit`, `plain React`
> - `[SITEMAP_OR_ROUTE_LIST]` - e.g. `docs/sitemap.md`
> - `[API_ROUTES_PATH]` - e.g. `routes/`, `src/handlers/`, `api/`
> - `[BUNDLE_TOOL]` - e.g. `@next/bundle-analyzer`, `vite-bundle-visualizer`, `webpack-bundle-analyzer`
> - Note: if this is a **public-facing** app, remove the "Out of scope" restriction on Core Web Vitals

## Applicability check

Before any other step: read `CLAUDE.md` and check the Framework and Language fields.

- If the project is a **web application** (Framework is NOT `N/A - native app` and NOT `N/A - no web frontend`): proceed to **Step 1 - Web Performance Audit** (Steps 1–5).
- If the project is a **native or backend-only application** (Framework is `N/A - native app` or `N/A - no web frontend`): skip Steps 1–5 and proceed directly to **Step 6 - Native/Backend Performance Audit**.



## Context and scope

**In scope**: bundle composition, server/client component boundaries, dynamic rendering triggers, lazy loading, data fetching efficiency (caching, parallelism, N+1), re-render patterns, image optimization. For native stacks: algorithmic complexity, stack-specific hot-path patterns, memory management, launch weight, energy impact, binary size.
**Out of scope**: SEO, CWV as ranking signals, `robots.txt`, `sitemap.xml`, OG tags, Lighthouse site audit, accessibility (→ `/ui-audit`), DB schema (→ `/skill-db`).
**Default mode**: audit (report only, no code changes). `mode:apply` makes focused non-breaking fixes.

**CWV reference (informational only - not primary deliverable for this internal app):**

| Metric | Good | Needs work | Poor | Primary cause |
|---|---|---|---|---|
| LCP | ≤ 2.5s | 2.5–4s | > 4s | Slow server response, render-blocking resources |
| CLS | ≤ 0.1 | 0.1–0.25 | > 0.25 | Unsized images, dynamic content above fold |
| INP | ≤ 200ms | 200–500ms | > 500ms | Blocking JS on event handlers |

Source: web.dev/articles/vitals. Use these thresholds only as triage anchors - not as primary deliverables.

---

## Step 0 - Target resolution

Parse `$ARGUMENTS` for `target:` and `mode:` tokens.

**Operating modes:**
| Mode | Behavior |
|---|---|
| `mode:audit` (default) | Report only - no code changes |
| `mode:apply` | Apply focused, non-breaking fixes (lazy loading wrappers, `Promise.all` parallelization). Describe each change before applying. |

**Target resolution:**
| Pattern | Meaning |
|---|---|
| `target:page:/dashboard` | Focus on the dashboard and its component tree (example) |
| No argument | **Full audit - ALL page files + layout files + lib files + API routes from sitemap.md. Maximum depth.** |

**STRICT PARSING - mandatory**: derive target ONLY from the explicit text in `$ARGUMENTS`. Do NOT infer target from conversation context, recent work, active block names, or project memory. If `$ARGUMENTS` contains no `target:` token → full audit across ALL files from sitemap.md at maximum depth. When a target IS provided → act with maximum depth and completeness on that specific scope only.

Announce: `Running perf-audit - scope: [FULL | target: <resolved>] - mode: [audit | apply]`
Apply the target filter to the file list in Step 1.

---

## Step 1 - Build file inventory

- All page/view files in scope
- All heavy components (those with chart, calendar, data table, rich text editor - high rendering cost)
- All layout/shell files (always include regardless of target - critical for B1 Flag B and B8)
- All service/data-access files directly called from page/component files - exclude pure utility files with no DB calls
- Framework configuration file (e.g. `next.config.ts`, `vite.config.ts`, `nuxt.config.ts`, `webpack.config.js`)

Read `docs/refactoring-backlog.md` - note existing `PERF-` entries to avoid duplicates.

---

## Step 2 - Server/Client boundary checks (Explore agent)

Launch a **single Explore subagent** (model: haiku) with all page, component, and lib files from Step 1:

"Run all 9 checks below. For each: state total match count, list every match as `file:line - excerpt`, and state PASS or FAIL. Adapt grep patterns to the project's framework - the concepts are universal, the specific APIs vary.

**CHECK B1 - Unnecessary client-side rendering scope**
Find components or pages marked for client-side rendering that do not actually use browser APIs (event handlers, state, refs, browser-only hooks).
- For SSR frameworks (Next.js, Nuxt, SvelteKit): grep for client-side directives (`'use client'`, `<script>` with `client:only`, etc.) and check if the file uses any browser-specific API.
- Flag A: any client-marked file that uses NONE of: state management, event handlers, refs, or browser APIs. It may be renderable on the server.
- Flag B: any client-marked layout or provider file that imports 5+ child components - if only a small interactive portion requires client rendering, extracting it into an island would let the layout render on the server.

**CHECK B2 - Heavy libraries in client bundle**
Grep for imports of known-heavy libraries in client-rendered files. Flag any imports of libraries that do NOT need browser APIs and could run server-side:
- Document processing libraries (PDF, XLSX, etc.) - typically server-only
- Rich text editors - acceptable in client IF interactive; flag if read-only render
- Chart libraries - acceptable in client if interactive; flag if static data-display only
- Any library > ~50KB that has a server-side equivalent
Flag: each import with the library name and whether a server-side pattern exists.

**CHECK B3 - Client-side data fetching that defeats server rendering**
Find client-rendered components that fetch data in lifecycle hooks (e.g. `useEffect`, `onMounted`, `onMount`) instead of using server-side data loading.
Flag: data fetching in client lifecycle hooks - these defeat server rendering and add a loading waterfall. Use server-side data loading with streaming/suspense, or a client-side cache library with proper revalidation.

**CHECK B4 - Unstable callback references defeating memoization**
Find inline arrow functions passed as props to memoized child components. Inline functions create new references on every parent render, defeating memoization.
Flag: each case. Skip native HTML element event handlers - frameworks batch these internally.

**CHECK B5 - Sequential await waterfall**
Pattern: two or more consecutive `await` calls for independent data sources in the same async function.
Grep in server-rendered files or API routes: lines matching `const .* = await` that appear consecutively (within 5 lines of each other) without the first result being an input to the second call.
Flag: each pair of sequential awaits that could be parallelised with `Promise.all` (or equivalent).
Example of violation: `const a = await getA(); const b = await getB();` where b doesn't depend on a.

**CHECK B6 - Missing caching on repeated server-side queries**
Find data fetches that run on every request without caching in server-rendered components.
Grep in server-rendered files for database query calls - check if they use any caching mechanism (framework cache, memoization, or explicit cache headers).
Flag: uncached queries in layout-level or frequently-visited components (e.g. navigation data, user profile). These execute on every page visit.

**CHECK B7 - Images without explicit dimensions (CLS risk)**
Find image elements (framework image component or native `<img>`) without width/height or fill/cover constraints.
Flag: each unsized image. Without dimensions, the browser cannot reserve layout space - content shifts when the image loads, causing CLS violations.

**CHECK B8 - Accidental dynamic rendering triggers**
Find patterns that force dynamic rendering at the layout level, opting entire route subtrees out of static generation:
- Request-scoped APIs (cookies, headers, session) called in layout files
- Explicit force-dynamic configuration in page/layout files
- No-cache directives in layout-level data fetches
Flag: each occurrence. Verify from context whether intentional (auth-dependent, real-time data) or avoidable with proper caching or component restructuring.

**CHECK B9 - Missing lazy loading for heavy client components**
Find imports of heavy libraries (rich text editors, chart libraries, complex UI components) that are statically imported without lazy loading.
Flag: any file where a heavy component is eagerly imported without using the framework's dynamic/lazy import mechanism (e.g. `React.lazy`, `next/dynamic`, `defineAsyncComponent`, dynamic `import()`)."

---

## Step 3 - Bundle composition check (main context)

Read the framework configuration file (e.g. `next.config.ts`, `vite.config.ts`, `webpack.config.js`, `nuxt.config.ts`).

**P1 - Bundle analyzer availability**
Check if a bundle analyzer is configured or available for the project's build tool:
- Webpack: `webpack-bundle-analyzer` or `@next/bundle-analyzer`
- Vite: `rollup-plugin-visualizer`
- Next.js 16+: `npx next experimental-analyze` (built-in)
- Other: check for any bundle analysis tooling in devDependencies
If no analyzer is configured or documented, flag as Medium - developers cannot easily audit bundle composition.

**P2 - Server-only package exclusion**
Check if the framework configuration excludes heavy server-only packages from the client bundle.
Identify packages in the project that should never be client-bundled (e.g. PDF processors, XLSX generators, database drivers, file system utilities).
Flag: any heavy server-only package not explicitly excluded from client bundling.

**P3 - Tree-shaking optimization for large libraries**
Check if the build configuration optimizes imports for large libraries with many exports where only a subset is used (e.g. icon libraries with hundreds of icons, utility libraries like lodash).
Note: some frameworks automatically optimize certain packages (check the framework docs). If a library is already auto-optimized by the build tool, note as PASS.
Flag: any package with 100+ exports where only a subset is used, not covered by the build tool's tree-shaking or import optimization.

---

## Step 4 - API query efficiency (Explore agent - separate pass)

"Run these 3 checks. Adapt grep patterns to the project's database client or ORM:

**CHECK Q1 - Unbounded queries (no limit on large-growth tables)**
Flag: each collection query without pagination bounds. Exception: export routes that intentionally fetch all for CSV/XLSX - verify from context.

**CHECK Q2 - Select * (over-fetching columns)**
Grep for select-all patterns in route handlers (e.g. `.select('*')`, `SELECT *`, `.findAll()` without field projection, `.all()` without `only()`).
Flag: each match. Fetching all columns is a performance and security risk - columns with large values (e.g. `body`, `content`, blob URLs) are sent over the wire unnecessarily.

**CHECK Q3 - N+1 patterns**
Pattern A: database query calls inside `.map(`, `for`, or `forEach` loops.
Pattern B: sequential `await` with a DB client call inside a loop body.
Flag: each match. N+1 on a list endpoint means N DB queries for an N-item list - use batch queries or embedded/eager loading instead."

---

## Step 5 - Produce report and update backlog

Generate the report using the template in `${CLAUDE_SKILL_DIR}/REPORT.md` (Web Audit section). Apply the severity guide and backlog writing rules from the same file.

---

## Execution notes

- In `mode:audit` (default): do NOT make any code changes - report only. After producing the report, ask: "Should I implement the High/Critical priority optimisations?"
- In `mode:apply`: apply only the fixes listed in Quick wins (isolated, non-breaking). Describe each change before writing it. Do not apply Strategic refactors without explicit user confirmation. Do NOT ask the closing question - the user already expressed intent via `mode:apply`.
- Check CLAUDE.md "Known Patterns" for intentionally configured server-external packages, client-side component exclusions, or layout-level client directives before flagging them.

---

## Step 6 - Native/Backend Performance Audit

**This path runs for non-web projects only.** Web projects use Steps 1–5 above.

### Profiling tools

**Primary tool**: [PERF_TOOL]
**Profile command**: `[PROFILER_COMMAND]`

Run the profiler on the main execution path. Identify the top 5 hotspots by CPU time and the top 5 by memory allocation. If profiling data is not available, proceed with static analysis and recommend running the profiler.

---

### Step 6a - Algorithmic and resource checks (Explore agent)

Launch a **single Explore subagent** (model: haiku) with all source files from the project:

"Run these 4 checks on the provided source files. For each: state total match count, list every match as `file:line - excerpt`, and state PASS or FAIL.

**CHECK NP1 - Nested iteration on collections**
Grep for nested loops (for/while/map/forEach inside another loop body) operating on collections or arrays.
Flag: O(n²) or worse complexity. Exclude small fixed-size iterations (< 10 items known at compile time).

**CHECK NP2 - Memory allocation in hot paths**
Flag:
- Object/string/array/buffer creation inside loops (new allocation per iteration)
- Unbounded caches or collections that grow without eviction
- Missing cleanup of heavyweight resources (file handles, DB connections, network sockets)

**CHECK NP3 - I/O bottleneck patterns**
Flag:
- Synchronous file I/O on the main/UI thread
- Sequential network calls that could be parallelized
- Unbuffered reads/writes on large files
- Missing timeout on network or IPC operations

**CHECK NP4 - Concurrency inefficiency**
Flag:
- Thread/goroutine/task creation inside loops without pooling
- Shared mutable state without synchronization primitives
- Blocking calls on async/concurrent paths
- Missing cancellation support on long-running operations"

---

### Step 6b - Stack-specific checks (main context)

Read the 10 largest source files by line count. Apply the checks relevant to the project language. Each check includes grep patterns - run them, then read flagged files for context.

**Swift**:
- Main-thread work: grep for `DispatchQueue.main.sync` outside UI layer files - synchronous dispatch on main blocks the UI. Also grep for `URLSession.shared.data` without `Task { }` wrapper in non-async contexts.
- Image downsampling: grep for `UIImage(named:` or `NSImage(named:` in collection view / table view code - flag if no `preparingThumbnail` or `CGImageSource` downsampling nearby.
- Core Data batch size: grep for `NSFetchRequest` - flag if `fetchBatchSize` is 0 or not set (default fetches all objects into memory).
- Retain cycles: grep for closures capturing `self` - flag `{ self.` or `{ [self]` without `[weak self]` in long-lived contexts (completion handlers, observers, timers).
- Allocation spikes: grep for object creation inside `for`/`while` loops (e.g. `= String(`, `= Data(`, `= NSMutableAttributedString(`).

**Kotlin**:
- Main-thread DB: grep for `Room` or `SQLite` calls outside `Dispatchers.IO` or `withContext(Dispatchers.IO)`.
- RecyclerView recycling: grep for `onBindViewHolder` - flag if view inflation (`inflate(`) happens inside bind instead of `onCreateViewHolder`.
- Bitmap memory: grep for `BitmapFactory.decode` - flag if no `inSampleSize` option is set (loads full-resolution bitmaps).
- Coroutine leaks: grep for `GlobalScope.launch` - flag each occurrence (no lifecycle-aware cancellation).
- StrictMode: grep for `StrictMode` in Application class - flag if absent in debug build (disk/network violations on main thread go undetected).

**Rust**:
- Unnecessary clone: grep for `.clone()` - flag if the value is only read after cloning (borrow would suffice).
- Hot-path allocation: grep for `Vec::new()`, `String::new()`, `Box::new(` inside loop bodies - flag if the allocation could be hoisted or reused.
- Dynamic dispatch: grep for `Box<dyn` - flag if the trait has a single implementor (generics avoid vtable overhead).
- Missing inline: grep for `pub fn` in hot-path modules with body < 5 lines - consider `#[inline]` for small frequently-called functions.

**Go**:
- Goroutine creation in loops: grep for `go func` or `go ` inside `for` - flag if no semaphore/pool limits the concurrency.
- Channel sizing: grep for `make(chan` - flag unbuffered channels (`make(chan T)`) in producer-consumer patterns (causes blocking).
- Defer in loops: grep for `defer` inside `for` - deferred calls accumulate until the function returns, not the loop iteration.
- Escape analysis: recommend running `go build -gcflags='-m' 2>&1 | grep 'escapes to heap'` on hot-path packages.

**Python**:
- Regex in loops: grep for `re.compile` or `re.search`/`re.match` with literal pattern inside `for`/`while` - flag if pattern is constant (compile once outside loop).
- List vs generator: grep for list comprehensions `[... for ... in ...]` passed to `sum(`, `max(`, `min(`, `any(`, `all(` - generator expression avoids materializing the full list.
- Deep copies: grep for `copy.deepcopy` - flag in hot paths (extremely expensive).
- GIL contention: grep for `threading.Thread` doing CPU-bound work - flag (use `multiprocessing` or `concurrent.futures.ProcessPoolExecutor` instead).

**Ruby**:
- N+1 queries: grep for `.each` followed by association access (e.g. `user.company`) - flag if no `.includes(` or `.eager_load(` on the parent query.
- String allocation: grep for string interpolation `"#{` inside loops - flag if the string could be built with `StringIO` or array join.
- GC pressure: grep for `.map { |x| x.` patterns creating intermediate arrays - flag if `.lazy.map` or `.each_with_object` would avoid allocation.

**Java**:
- Autoboxing: grep for `Integer`, `Long`, `Double` in loop variable declarations - flag (use primitive types `int`, `long`, `double`).
- String concat in loops: grep for `+=` on String variables inside loops - flag (use `StringBuilder`).
- Connection pool: grep for `DriverManager.getConnection` - flag if no connection pool (HikariCP, c3p0) is configured.
- Stream overhead: grep for `.stream().` on small collections (< 10 items) - traditional loop may be faster due to stream pipeline overhead.

**dotnet**:
- LINQ allocations: grep for `.Select(`, `.Where(`, `.ToList()` chains - flag if intermediate `.ToList()` materializes unnecessarily before final consumption.
- String concatenation: grep for `+=` on string inside loops - flag (use `StringBuilder` or `string.Join`).
- LOH fragmentation: grep for `new byte[` with size > 85000 - flag (Large Object Heap allocations are expensive to collect).
- Async overhead: grep for `async` methods that contain only a single `await` with no branching - flag as candidates for removing async wrapper (avoids state machine overhead).

---

### Step 6c - Resource footprint checks (main context)

**CHECK NR1 - Launch / startup weight**
Identify the application entry point:
- Swift: `@main` struct or `AppDelegate.didFinishLaunchingWithOptions`
- Kotlin: `Application.onCreate` or `MainActivity.onCreate`
- Rust/Go/Python/Ruby/Java/dotnet: `main()` function or entry module

Grep for heavy operations in the entry point: database initialization, network calls, large file reads, complex object graph construction. Flag any operation that could be deferred (lazy initialization) or moved to a background thread/task.

**CHECK NR2 - Memory management patterns**
- Swift: grep for missing `autoreleasepool` in batch processing loops. Grep for `NSCache` or `Dictionary` used as cache without size limit.
- Kotlin: grep for `static` or `companion object` holding Activity/Context references (memory leak). Check `onDestroy` for missing listener/observer cleanup.
- Rust: grep for `Vec` that grows via `push` in a loop without `with_capacity` pre-allocation.
- Go: grep for `sync.Map` or map growth without periodic cleanup - flag unbounded maps.
- All: grep for large static/global collections that persist for the process lifetime.

**CHECK NR3 - Energy and background patterns** (mobile stacks only)
- Swift: grep for `Timer.scheduledTimer` or `DispatchSource.makeTimerSource` - flag if no `tolerance` set (tight timers prevent CPU sleep). Grep for `CLLocationManager` with `startUpdatingLocation` - flag if `startMonitoringSignificantLocationChanges` would suffice.
- Kotlin: grep for `AlarmManager.setRepeating` or `Handler.postDelayed` in loops - flag excessive wake-ups. Grep for `LocationRequest` with high frequency updates.
- Flag: any background polling pattern (repeated network calls on a timer) that could use push notifications or event-driven updates instead.

**CHECK NR4 - Binary / artifact size**
- Grep for large embedded assets in source directories (images > 1MB, bundled databases, embedded fonts). Flag if assets could be downloaded on demand.
- Swift: check for `DEBUG` conditional code that may leak into release builds (grep for `#if DEBUG` blocks containing large test fixtures or mock data).
- Kotlin: check for `debugImplementation` dependencies accidentally in `implementation` (grep `build.gradle` for heavy debug-only libraries in the wrong configuration).
- All: grep for unused imports at module/package level - flag files importing modules they don't use (increases link time and potentially binary size).

---

### Step 6d - Produce report and update backlog

Generate the report using the template in `${CLAUDE_SKILL_DIR}/REPORT.md` (Native Audit section). Apply the severity guide and backlog writing rules from the same file.

---

### Native audit - execution notes

- In `mode:audit` (default): report only. After report, ask: "Should I implement the High/Critical priority optimisations?"
- In `mode:apply`: apply only Quick wins. Describe each change before writing.
