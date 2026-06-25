# /visual-audit

> Visual audit - typography, spacing, colour discipline, dark-mode polish, info density. Scores pages on 10 aesthetic dimensions via Playwright screenshots.

| Tiers | Model | Flags |
|---|---|---|
| Tier M · Tier L | Opus (deep) | `[quick|full] [target:page:&lt;route&gt;|target:role:&lt;role&gt;|target:section:&lt;section&gt;]` |

---

## Dove e quando

Run after implementing a new UI section or before a design review, to catch low-level polish issues without a full design handoff. It closes the gap between implementation and the intended visual system, useful for both designers reviewing output and developers self-reviewing before sharing.

## Output atteso

A structured report covering typography scale, spacing consistency, visual hierarchy, dark mode correctness, and micro-polish items. Each finding references the component or CSS class involved. A typical finding: a heading using a raw pixel value instead of the design token for h2 font size.
