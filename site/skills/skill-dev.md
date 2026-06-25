# /skill-dev

> Code quality audit: detect cross-module coupling, N+1 queries, dead exports, antipatterns, over-large components. Cross-checks against refactoring backlog.

| Tiers | Model | Flags |
|---|---|---|
| Tier M · Tier S · Tier L | Sonnet | — |

---

## Dove e quando

Run during a codebase health check or before a major refactor to understand where technical debt is concentrated. The churn-times-debt hotspot matrix surfaces files that are both frequently changed and poorly structured, so effort goes where it has the most impact.

## Output atteso

A top-10 hotspot matrix with file path, churn score, debt score, and a short description of the dominant issue. Additional sections cover coupling, dead code, and TypeScript safety gaps. A typical finding: a utility module with high churn, multiple `any` annotations, and three unused exports.
