# security-audit - Report Template

Generate the report using this template. Fill each section with findings from Steps 2-5.

```
## Security Audit - [DATE] - [TARGET]

### Executive summary
- [2-8 bullets: lead with the most critical risk. One bullet per Critical/High finding or notable PASS cluster. Be specific - name the route, table, or pattern.]

### Scope reviewed
- Routes / entry points: [N routes, list categories]
- Validation layer: schema validation in [N] route files
- DB/access control layer: [N] migration files + DB advisors (if available)
- Headers: server config + live curl on staging
- Assumptions: [e.g. "No server-side form actions - N/A"]

### Security maturity assessment
| Dimension | Rating | Notes |
|---|---|---|
| Auth coverage | low/medium/high | [summary] |
| Authorization quality (RBAC + ownership) | low/medium/high | [summary] |
| Input validation coverage | low/medium/high | [summary] |
| Data exposure control | low/medium/high | [summary] |
| RLS / row isolation | low/medium/high | [summary] |
| Config hardening (headers, proxy) | low/medium/high | [summary] |
| Release readiness | low/medium/high | [summary] |

### Auth & Authorization (API routes)
| # | Check | Routes flagged | Severity | Verdict |
|---|---|---|---|---|
| A1 | Missing auth check | N | Critical | ✅/❌ |
| A2 | Missing role check (admin routes) | N | Critical | ✅/❌ |
| A3 | Missing input validation (body/params/query) | N | High | ✅/❌ |
| A4 | Raw input in queries | N | Critical | ✅/❌ |
| A5 | Sensitive fields in responses | N | High | ✅/❌ |
| A6 | Cron routes missing secret | N | Critical | ✅/❌ |
| A7 | Export routes missing role check | N | High | ✅/❌ |
| A8 | Client-exposed env var secret leak | N | Critical | ✅/❌ |
| A9 | Privileged credentials in client code | N | Critical | ✅/❌ |
| A10 | Public URL on private storage asset | N | High | ✅/❌ |
| A11 | Open redirect | N | High | ✅/❌ |
| A12 | Mass assignment | N | High | ✅/❌ |
| A13 | Horizontal AC / IDOR (dynamic routes) | N | High | ✅/❌ |
| A14 | State machine enforcement | N | High | ✅/❌ |

### Response Shape Review
| # | Check | Verdict | Notes |
|---|---|---|---|
| R1 | Sensitive field exposure (PII, financial) | ✅/❌ | |
| R2 | Restricted data exposure | ✅/❌ | |
| R3 | Error message verbosity | ✅/❌ | |
| R5 | Rate limiting on high-value endpoints | ✅/❌ | |

### RLS - Code-level check
| # | Check | Tables flagged | Verdict |
|---|---|---|---|
| RLS-1 | Tables without row-level access control | N | ✅/❌ |
| RLS-2 | Access control enabled but zero policies | N | ✅/❌ |
| RLS-3 | Write-side policy checks missing | N | ✅/❌ |

### Native Application Security (if applicable)
| # | Check | Matches | Severity | Verdict |
|---|---|---|---|---|
| NS1 | Hardcoded secrets | N | Critical | ✅/❌ |
| NS2 | Dependency vulnerabilities | N | High | ✅/❌ |
| NS3 | Unvalidated external input | N | High | ✅/❌ |
| NS4 | Platform security (stack-specific) | N | varies | ✅/❌ |
| NS5 | Sensitive data protection | N | High | ✅/❌ |
| NS6 | Code signing credentials in repo | N | Critical | ✅/❌ |

### Database Security Advisors (if available)
| Level | Count | Items |
|---|---|---|
| error (Critical) | N | [list] |
| warning (High) | N | [list] |
| info (Low) | N | [list] |

### Dependency CVEs
| Package | Version | Severity | CVE | Fix available |
|---|---|---|---|---|
| [name] | [range] | critical/high | [id] | yes/no |

### HTTP Headers
| Header | In config | In live response | Verdict |
|---|---|---|---|
| X-Frame-Options | ✅/❌ | ✅/❌ | ✅/❌ |
| X-Content-Type-Options | ✅/❌ | ✅/❌ | ✅/❌ |
| Referrer-Policy | ✅/❌ | ✅/❌ | ✅/❌ |
| Content-Security-Policy | ✅/❌ | ✅/❌ | ✅/❌ |
| Permissions-Policy | ✅/❌ | ✅/❌ | ✅/❌ |

### Proxy / Middleware
| Check | Verdict | Notes |
|---|---|---|
| API protected behind auth layer | ✅/❌ | |
| Auth-gated redirects server-side (not client-side) | ✅/❌ | |
| Public route whitelist is narrow (no wildcard) | ✅/❌ | |
| No forgeable bypass header trusted | ✅/❌ | |

### Prioritized findings (Critical → High → Medium → Low)
Format: `[SEVERITY] route/file:line - check# - issue - exploit path - recommended fix - effort`

### Quick wins
[findings that are isolated, low-risk fixes - e.g. add ownership filter, add validation enum on query param, add write-side policy check]

### Strategic refactors
[findings requiring broader changes - e.g. state machine enforcement across all transition routes, centralized response serializers, access control policy overhaul]

### Validation checklist
After applying fixes, verify:
- [ ] Unauthenticated request (no token) to each fixed route → 401
- [ ] Horizontal AC: request with valid token but different owner's ID → 403 or 404
- [ ] State machine: request with invalid transition on current state → 422
- [ ] Path param validation: request with invalid ID format → 400
- [ ] Row-level access: unprivileged query on fixed tables → 0 rows (not error)
- [ ] DB advisors re-run after schema changes → 0 critical-level items
```

## Severity guide

- **Critical**: unauthenticated route exposing or modifying data; row-level access bypass; privileged credentials in client code; client-exposed env var secret; cron route with no secret check; raw input in queries; DB advisor critical-level finding; table missing row-level access control on sensitive data (RLS-1); hardcoded secrets in source code (NS1); signing credentials committed to repo (NS6); unsafe block without safety justification in Rust (NS4)
- **High**: admin route without role check; sensitive PII/financial field exposed to non-owner; export route without role check; public URL on private storage asset; open redirect; mass assignment; horizontal AC / IDOR on sensitive records (A13); state machine bypass on financial/status transitions (A14); missing write-side policy checks (RLS-3); DB advisor warning-level finding; critical/high CVE in production dependency (NS2); unvalidated external input at system boundary (NS3); sensitive data written without platform encryption (NS5); disabled code signing (NS6)
- **Medium**: missing validation on write route body; unvalidated path param or query param used in DB filter (A3); error message leaking DB internals; missing security header; no rate limiting on high-value endpoints; access control enabled but zero policies (RLS-2); sensitive data in log output (NS5)
- **Low**: header best-practice gap; informational DB advisor finding; moderate/low CVE not directly exploitable; state machine bypass on low-risk status fields
