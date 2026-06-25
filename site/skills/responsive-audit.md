# /responsive-audit

> Responsive audit: test pages at 375/768/1024px breakpoints via Playwright. Checks overflow, tap targets, sidebar collapse, text reflow, WCAG 1.4.4 zoom.

| Tiers | Model | Flags |
|---|---|---|
| Tier M · Tier L | Opus (deep) | `[quick|full|wcag] [target:page:&lt;route&gt;|target:role:&lt;role&gt;|target:section:&lt;section&gt;]` |

---

## Dove e quando

Run after adding a new layout or component that will be used on mobile, or when QA reports breakage on small screens. It covers the full 320-1024px range and checks WCAG tap target sizes, which manual testing at a single viewport often misses.

## Output atteso

A viewport-by-viewport report listing layout breakage, elements with tap targets below 44x44px, and WCAG failures. Each finding includes the breakpoint, selector, and measured value. A typical finding: a navigation link at 320px with a 28px tap target and overlapping adjacent text.
