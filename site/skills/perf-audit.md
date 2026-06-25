# /perf-audit

> Performance audit: bundle size, lazy loading, data fetching, caching, N+1 queries, image optimization. Native mode checks memory, I/O, launch weight, energy.

| Tiers | Model | Flags |
|---|---|---|
| Tier M · Tier S · Tier L | Sonnet | `[target:section:&lt;section&gt;|target:page:&lt;route&gt;|mode:audit|mode:apply]` |

---

## Dove e quando

Run when a build starts slowing, a PR adds new async data fetching, or a Lighthouse score drops. The 8-stack pattern library covers common frameworks, so it catches serial awaits and unoptimized queries that code review typically misses.

## Output atteso

A categorized report grouped by bundle size, async efficiency, and query patterns, each finding annotated with estimated impact. A typical finding: three sequential awaits inside a request handler flagged as parallelizable with Promise.all, with the refactored snippet shown.
