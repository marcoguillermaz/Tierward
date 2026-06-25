# /security-audit

> Security audit: auth/authz on API routes, input validation, RLS policies, response shape review, secret exposure, HTTP headers. Native mode checks entitlements and Keychain. MCP-aware (v1.20+): when `mcp-nvd` server is wired, Step 3c queries live CVE data instead of static `npm audit` / `pip-audit` snapshots; falls back to local audit commands when MCP unreachable.

| Tiers | Model | Flags |
|---|---|---|
| Tier M · Tier S · Tier L | Sonnet | `[target:page:&lt;route&gt;|target:role:&lt;role&gt;|target:section:&lt;section&gt;]` |

---

## Dove e quando

Run before any release, or after adding authentication, new API routes, or database access. The 3-path dispatch (WEB/NATIVE/HYBRID) means the audit only checks patterns relevant to the actual stack, so it stays focused without manual scoping. Security engineers and solo developers alike benefit before merging user-facing changes.

## Output atteso

A severity-tiered report (Critical / High / Medium / Low) covering auth gaps, missing input validation, RLS misconfigurations, and known CVEs pulled live via the mcp-nvd server when available. A typical finding: an API route missing authentication middleware, with the exact file path and suggested fix.
