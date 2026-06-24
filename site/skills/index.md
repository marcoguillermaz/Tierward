# Skills

Tierward ships 26 audit skills — executable multi-step programs that run inside Claude Code. Each skill is a structured workflow with model routing: Haiku for mechanical checks, Sonnet for analysis.

Skills are conditionally installed based on your project flags (`hasApi`, `hasDatabase`, `hasFrontend`, `hasDesignSystem`). Run `npx tierward doctor` to see which skills are installed and active.

## Install individual skills

```bash
npx tierward add skill security-audit
npx tierward add skill arch-audit
```

## Universal skills (Tier S, M, L)

Available in all tiers above Discovery.

| Skill | Purpose |
|---|---|
| `/arch-audit` | Governance files vs Anthropic docs. Auto-fixes deprecations. |
| `/security-audit` | Auth, input validation, RLS, CVE scan. 3-path: WEB / NATIVE / HYBRID. MCP-aware (v1.20+): queries `mcp-nvd` for live CVE data with local fallback. |
| `/perf-audit` | Bundle size, serial awaits, query efficiency. 8-stack patterns. |
| `/skill-dev` | Coupling, duplication, dead code, debt-density. Step 3b (v1.22+): hotspot priority via churn × debt — top-10 ranked by 4-quadrant matrix. |
| `/simplify` | Early returns, nesting, dead code. Applies changes directly. |
| `/commit` | Conventional Commits — auto-detects type, scope, description. |
| `/skill-security` | Security scan for Claude Code skills using SkillSpector: prompt injection, data exfiltration, MCP tool poisoning, supply chain. 64-pattern scanner. |
| `/systematic-debugging` | Root-cause investigation before any fix. STOP gate between hypothesis and fix: the hypothesis must be written and verified against evidence before touching code. |

## Team skills (Tier M, L)

Enabled when you upgrade to Tier M or above.

| Skill | Purpose |
|---|---|
| `/api-design` | URL naming, HTTP verbs, response envelope, pagination. |
| `/skill-db` | Schema normalization, indexes, N+1 queries, RLS. |
| `/migration-audit` | Stack-aware migration safety: data loss, rollback, lock-heavy DDL. Prisma / Drizzle / Supabase / SQL. |
| `/visual-audit` | Typography, spacing, hierarchy, dark mode, micro-polish. |
| `/ux-audit` | ISO 9241-11, Nielsen heuristics, user confidence. |
| `/responsive-audit` | Layout at 320–1024px, tap targets, WCAG. |
| `/ui-audit` | Design token compliance, component adoption, empty states. |
| `/accessibility-audit` | axe-core WCAG 2.2, APCA contrast, static a11y (aria, tabindex, focus, labels). |
| `/test-audit` | Coverage (lcov / Istanbul / Cobertura / go / tarpaulin / xcresult), pyramid shape, anti-patterns. |
| `/doc-audit` | Doc drift: link resolution, code-block syntax, Tierward placeholder residuals, slash-command name match, ADR freshness. |
| `/api-contract-audit` | OpenAPI contract drift, breaking-change detection, Richardson Maturity L0–L3 scoring. Auto-gen for FastAPI / NestJS / Express / Next.js / Django REST. |
| `/infra-audit` | Security across GitHub Actions, Dockerfile, K8s, Terraform, GitLab CI. Stack-agnostic. |
| `/compliance-audit` | GDPR profile: data-subject rights, consent, PII identification, encryption-at-rest, retention, sub-processors. SOC 2 / HIPAA scaffolded. |
| `/dependency-audit` | Outdated package audit: Tier A (safe batch) / B (non-core major) / C (core/breaking-risk). MCP-aware (v1.20+): queries `package-registry-mcp`. |
| `/pr-review` | Autonomous local PR review via gh CLI. Posts findings as PR comments. `--deep` escalates to Opus for sensitive changes. |
| `/skill-review` | Quality review pipeline for skill portfolios. Spec compliance, cross-tier coherence, behavioral fixtures. |
| `/dependency-scan` | Pipeline-integrated (Phase 1): returns the full file list — routes, components, shared types, DB tables — fed into the Phase 1 STOP gate. |

## Tier L only

| Skill | Purpose |
|---|---|
| `/context-review` | Pipeline-integrated (Phase 8.5): recompacts `CLAUDE.md` and detects context drift after block closure. |

## Custom skills

Create project-specific skills that Tierward preserves across `upgrade` and `init`:

```
.claude/skills/custom-deploy/SKILL.md
.claude/skills/custom-db-seed/SKILL.md
```

The `custom-` prefix tells Tierward never to overwrite, prune, or modify the skill during any operation. See the [Custom Skills Guide](https://github.com/marcoguillermaz/Tierward/blob/main/docs/custom-skills.md) for the full frontmatter reference.
