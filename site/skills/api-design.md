# /api-design

> API design audit: endpoint naming, HTTP verbs, response shapes, error codes, pagination, validation consistency. Run when adding or modifying API routes.

| Tiers | Model | Flags |
|---|---|---|
| Tier M · Tier L | Sonnet | `[target:section:&lt;section&gt;|target:role:&lt;role&gt;|mode:audit|mode:remediation|mode:apply]` |

---

## Dove e quando

Run when designing new API endpoints or reviewing an existing surface before it becomes a public contract. Teams building client integrations benefit most, since naming inconsistencies and missing pagination are far cheaper to fix before consumers exist.

## Output atteso

A structured review covering URL naming, HTTP verb correctness, response envelope consistency, and pagination completeness. Each finding is rated by impact and includes a corrected example. A typical finding: a POST endpoint returning 200 instead of 201 with no Location header.
