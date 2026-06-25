# /ux-audit

> UX audit: evaluate user flows against ISO 9241-11 and Nielsen heuristics. Measures task completion, feedback clarity, cognitive load, error recovery via Playwright.

| Tiers | Model | Flags |
|---|---|---|
| Tier M · Tier L | Opus (deep) | `[flow:&lt;flow-id&gt;|role:&lt;role&gt;|full] [target:page:&lt;route&gt;|target:role:&lt;role&gt;|target:section:&lt;section&gt;]` |

---

## Dove e quando

Run before a usability review or after user feedback indicates confusion with a flow. It applies ISO 9241-11 and Nielsen heuristics systematically, which is useful when there is no UX researcher available to conduct a formal evaluation.

## Output atteso

A heuristic-tagged report with findings ordered by impact on user confidence and task completion. Each finding includes the violated principle, the affected interaction, and a concrete recommendation. A typical finding: a destructive action with no confirmation dialog, violating the error prevention heuristic.
