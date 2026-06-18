# Perf Audit - Report Template

## Web Audit - Report Template

```
## Perf Audit - [DATE] - [SCOPE] - mode: [audit | apply]
### Sources: framework docs, web.dev/vitals, build tool docs

### Executive summary
- [2-8 bullets: one per Critical/High finding or notable PASS. Lead with the most impactful issue.]

### Scope reviewed
- Routes/components scanned: [N files]
- Config files: framework config [present/absent]
- Bundle evidence: bundle analyzer [configured / not configured]
- Assumptions: [any scope limitations, e.g. "layout files excluded from B8 - none found"]

### Core Web Vitals thresholds (reference)
| Metric | Good | Needs work | Poor | Primary cause |
|---|---|---|---|---|
| LCP | ≤ 2.5s | 2.5–4s | > 4s | Slow server response, render-blocking resources |
| CLS | ≤ 0.1 | 0.1–0.25 | > 0.25 | Unsized images, dynamic content above fold |
| INP | ≤ 200ms | 200–500ms | > 500ms | Blocking JS on event handlers |

### Server/Client Boundary
| # | Check | Matches | Severity | Verdict |
|---|---|---|---|---|
| B1 | Unnecessary client-side rendering scope | N | Medium | ✅/⚠️ |
| B2 | Heavy libraries in client bundle | N | High | ✅/⚠️ |
| B3 | Client-side data fetching | N | High | ✅/⚠️ |
| B4 | Unstable callbacks on memo'd children | N | Low | ✅/⚠️ |
| B5 | Sequential await waterfall | N | High | ✅/⚠️ |
| B6 | Uncached server queries | N | Medium | ✅/⚠️ |
| B7 | Images without dimensions (CLS) | N | Medium | ✅/⚠️ |
| B8 | Dynamic rendering triggers | N | High | ✅/⚠️ |
| B9 | Missing lazy loading for heavy components | N | Medium | ✅/⚠️ |

### Bundle Composition
| # | Check | Verdict | Notes |
|---|---|---|---|
| P1 | Bundle analyzer availability | ✅/⚠️ | [which tool] |
| P2 | Server-only package exclusion | ✅/⚠️ | [missing packages if any] |
| P3 | Tree-shaking optimization | ✅/⚠️ | [large library status] |

### API Query Efficiency
| # | Check | Matches | Verdict |
|---|---|---|---|
| Q1 | Unbounded queries | N | ✅/⚠️ |
| Q2 | Select * | N | ✅/⚠️ |
| Q3 | N+1 patterns | N | ✅/⚠️ |

### Performance maturity assessment
| Dimension | Score | Notes |
|---|---|---|
| Boundary discipline (B1, B2, B9) | 🟢/🟡/🔴 | [summary] |
| Client bundle health (P1, P2, P3) | 🟢/🟡/🔴 | [summary] |
| Data-fetching quality (B3, B5, B6) | 🟢/🟡/🔴 | [summary] |
| Async/query efficiency (Q1, Q2, Q3) | 🟢/🟡/🔴 | [summary] |
| Rendering efficiency (B4, B8) | 🟢/🟡/🔴 | [summary] |
| Image / layout stability (B7) | 🟢/🟡/🔴 | [summary] |
Scoring: 🟢 = 0 High/Critical findings · 🟡 = 1-2 Medium findings · 🔴 = any High or Critical finding

### Findings requiring action ([N] total)
[Sorted Critical → High → Medium → Low]
Format: `[SEVERITY] file:line - check# - issue - impact - suggested fix`

### Quick wins (implement in < 1 hour each)
[findings that are isolated, low-risk, and self-contained - e.g. add Promise.all, add lazy/dynamic wrapper]

### Strategic refactors (require planning)
[findings that affect multiple files or need architectural decisions - e.g. move data fetch to server-rendered path, extract client island from layout]

### Validation checklist
After applying fixes, verify:
- [ ] Pages that had B5 waterfall: add timing log to confirm parallel fetch time ≤ slowest single fetch
```

---

## Web Audit - Backlog writing rules

Present all findings with severity Medium or above as a numbered decision list, sorted Critical → High → Medium:

```
Found N findings at Medium or above. Which to add to backlog?

[1] [CRITICAL] PERF-? - file:line - one-line description
[2] [HIGH]     PERF-? - file:line - one-line description
[3] [MEDIUM]   PERF-? - file:line - one-line description
...

Reply with numbers to include (e.g. "1 2 4"), "all", or "none".
```

**Wait for explicit user response before writing anything.**

Then write ONLY the approved entries to `docs/refactoring-backlog.md`:
- Assign ID: `PERF-[n]` (increment from last PERF entry)
- Add row to the priority index table with columns: `| PERF-N | check# | file:line | Severity | Description |`
- Add full detail section: `### PERF-N - [check label]` with sub-sections: **File**, **Issue**, **Impact**, **Suggested fix**

---

## Web Audit - Severity guide

- **Critical**: N+1 in dashboard/list endpoints under heavy load (Q3); heavy server-only library discovered in client bundle (B2)
- **High**: Sequential await waterfall with >500ms combined latency risk (B5); client-side data fetching on a primary route (B3); unbounded query on large-growth table (Q1); request-scoped API in a layout causing route tree force-dynamic (B8)
- **Medium**: Uncached layout-level server queries called on every page load (B6); select-all on tables with large-text columns (Q2); unsized images (B7 - CLS risk); tree-shaking not configured for large libraries (P3); unnecessary client-side rendering scope (B1); missing lazy loading on heavy components (B9)
- **Low**: Unstable callbacks on memoized children (B4); minor code-splitting opportunities; bundle analyzer not configured (P1)

---

## Native Audit - Report Template

```
## Perf Audit - [DATE] - [SCOPE] - mode: [audit | apply]
### Sources: platform profiling documentation, language performance guides

### Executive summary
- [2-8 bullets: one per Critical/High finding or notable PASS]

### Scope reviewed
- Source files scanned: [N files]
- Profiling tool: [PERF_TOOL]
- Profile data: [available / not available - recommend running profiler]

### Algorithmic & Resource Checks
| # | Check | Matches | Severity | Verdict |
|---|---|---|---|---|
| NP1 | Nested iteration on collections | N | High | ✅/⚠️ |
| NP2 | Memory allocation in hot paths | N | Medium | ✅/⚠️ |
| NP3 | I/O bottleneck patterns | N | High | ✅/⚠️ |
| NP4 | Concurrency inefficiency | N | Medium | ✅/⚠️ |

### Stack-Specific Checks
| Check | Verdict | Notes |
|---|---|---|
| [check name per 6b] | ✅/⚠️ | [details] |

### Resource Footprint Checks
| # | Check | Matches | Severity | Verdict |
|---|---|---|---|---|
| NR1 | Launch / startup weight | N | High | ✅/⚠️ |
| NR2 | Memory management patterns | N | Medium | ✅/⚠️ |
| NR3 | Energy / background patterns | N | Medium | ✅/⚠️ |
| NR4 | Binary / artifact size | N | Low | ✅/⚠️ |

### Findings requiring action ([N] total)
[Sorted Critical → High → Medium → Low]
Format: `[SEVERITY] file:line - check# - issue - impact - suggested fix`

### Quick wins
[isolated, low-risk, self-contained fixes]

### Strategic refactors
[multi-file changes or architectural decisions needed]
```

---

## Native Audit - Backlog writing rules

Present all findings with severity Medium or above:

```
Found N findings at Medium or above. Which to add to backlog?

[1] [HIGH]     PERF-? - file:line - one-line description
[2] [MEDIUM]   PERF-? - file:line - one-line description

Reply with numbers to include (e.g. "1 2 4"), "all", or "none".
```

**Wait for explicit user response before writing anything.**

Then write approved entries to `docs/refactoring-backlog.md` using the same ID format (`PERF-[n]`).

---

## Native Audit - Severity guide

- **Critical**: O(n²+) in a hot path processing user-visible data; memory leak causing OOM on long sessions; main-thread blocking > 1s; Activity/Context leak via static reference (Kotlin)
- **High**: synchronous I/O blocking UI/main thread (NP3); sequential network calls with >500ms combined latency; goroutine/thread/coroutine leak; unbounded collection growth (NR2); heavy initialization in app entry point delaying launch (NR1); GlobalScope.launch without lifecycle cancellation
- **Medium**: unnecessary allocations in moderate-frequency paths (NP2); missing cancellation on background tasks; suboptimal data structure choice; missing resource cleanup; excessive timer/location wake-ups (NR3); retain cycles in closures; regex compilation in loops
- **Low**: minor allocation optimization; style-level concurrency improvement; profiler not configured; binary size overhead from unused assets (NR4); missing `#[inline]` on small functions
