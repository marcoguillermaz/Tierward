# /ui-audit

> Audit UI for design token compliance and component adoption. Static grep-based analysis against the sitemap's page and component files. Requires a design system with semantic tokens.

| Tiers | Model | Flags |
|---|---|---|
| Tier M · Tier L | Sonnet | `[target:section:&lt;section-name&gt;]` |

---

## Dove e quando

Run when integrating a design system into a codebase for the first time, or after a sprint that added multiple new components, to ensure design token usage is consistent and available components are not being reimplemented. Particularly useful in teams with mixed design-system familiarity.

## Output atteso

A report covering token compliance, component adoption gaps, and missing empty or error states. Each finding links to the relevant component or token. A typical finding: a custom dropdown implementation in three files where the design system already provides one with the same API.
