# Claude Code + Project - Cheat Sheet

> Quick reference for commands, pipeline shortcuts, and available skills.

---

## Claude Code - Session

| Command | Action |
|---|---|
| `/clear` | Clear conversation context |
| `/compact [note]` | Compact conversation (CLAUDE.md survives) |
| `/model <name>` | Switch model: `sonnet`, `opus`, `haiku` |
| `/memory` | View/edit CLAUDE.md and auto-memory |
| `/resume` | Resume a previous session |

---

## Pipeline shortcuts

| Situation | Action |
|---|---|
| Starting a new block | `git checkout -b feature/block-name` |
| Quick fix (≤3 files) | `git checkout -b fix/description` - use Fast Lane |
| Session interrupted | Check `.claude/session/` for recovery file |
| Context window ~50% | Run `/compact` before continuing |
| End of block | Run context review (C1–C12) then `/compact` |

---

## Audit skills

Run these on demand. Each skill reads the codebase, produces a structured report, and appends findings to `docs/refactoring-backlog.md`.

| Skill | What it checks | When to run |
|---|---|---|
| `/arch-audit` | CLAUDE.md compliance, Anthropic docs drift, ecosystem consistency, hook config | Weekly; after upgrading Claude Code; after changing CLAUDE.md |
| `/commit` | Classify staged changes, generate conventional commit message, execute commit | After every implementation phase to commit work |
| `/security-audit` | Auth guards, input validation, sensitive data in responses, HTTP headers | Before production deploy; after adding new API routes |
| `/skill-security` | Security scan for Claude Code skills using SkillSpector: prompt injection, data exfiltration, MCP tool poisoning, supply chain, taint tracking | Before installing any third-party skill |
| `/skill-dev` | Coupling, duplication, dead code, magic strings, oversized components | Before major refactoring; quarterly review |
| `/skill-db` | Missing indexes, access control gaps, constraint completeness, N+1 queries | After migration waves; before production releases |
| `/migration-audit` | Migration file safety: lock-heavy DDL, missing rollback, data loss, unsafe ALTER TYPE | After writing a migration, before applying to staging |
| `/api-design` | HTTP verb correctness, URL structure, response shape, error codes, pagination | After adding 3+ new routes; quarterly |
| `/perf-audit` | Server/client boundaries, heavy imports, serial awaits, image optimization, N+1 | Before production releases; after major UI changes |
| `/accessibility-audit` | axe-core WCAG 2.2 scan, APCA contrast, static a11y patterns (aria, tabindex, focus, labels) | After UI changes; before compliance milestones |
| `/responsive-audit` | Breakpoint coverage, viewport rendering, touch targets, layout integrity at mobile/tablet/desktop | After UI changes to public-facing routes |
| `/visual-audit` | Typography, spacing, colour consistency, hierarchy, density, dark-mode rendering | After UI changes; before design sign-off |
| `/ux-audit` | Task completion paths, feedback clarity, cognitive load, error recovery | After adding user flows; before usability reviews |
| `/ui-audit` | Design system token compliance, component adoption, empty/error/loading states | After UI changes; when design system is configured |
| `/test-audit` | Coverage (lcov/Istanbul/Cobertura/go/tarpaulin/xcresult), pyramid shape, anti-patterns (`.only`, skipped, empty, no-assertion, sleeps) | After Phase 3 tests green; every block |
| `/doc-audit` | Relative-link resolution, code-block syntax (json/yaml/toml), CDK placeholder residuals, slash-command name match, skill-count consistency, ADR freshness, stack-specific doc sync (Next.js / Django / Swift) | After doc changes; every block that touches README or `docs/` |
| `/api-contract-audit` | OpenAPI contract drift (endpoints, schemas, status codes), breaking-change detection vs previous spec, versioning consistency, security scheme alignment, Richardson Maturity L0-L3 scoring | After API changes; before releasing contract updates to external consumers |
| `/infra-audit` | GitHub Actions (pwn-request, secret logging, pinning, permissions), Dockerfile (root user, latest tag, URL add), K8s (runAsNonRoot, privileged, hostNetwork), Terraform (IAM wildcards, state in git), GitLab CI | After pipeline or IaC changes; every block that touches `.github/workflows/`, `Dockerfile`, K8s manifests, or `*.tf` |
| `/compliance-audit` | GDPR profile: data-subject rights (delete, export, rectify), consent capture, lawful basis, PII identification, encryption-at-rest on special-category, logging hygiene, retention, sub-processors. SOC 2 and HIPAA scaffolded for v1.15+ | Before EU-facing product launch; quarterly review |
| `/dependency-audit` | Outdated packages classified Tier A (safe batch) / B (non-core major) / C (core/breaking-risk), changelog summary, codebase impact grep, runtime LTS status. Stack-aware (node-ts, python, swift; agnostic fallback for others). Audit-only in v1 | After every release; quarterly batch updates; before any major version bump |
| `/pr-review` | Autonomous local PR review via gh CLI. Spawns review subagent on the diff, classifies findings (Critical / Major / Minor) using universal + stack-specific severity criteria, posts the review as a PR comment for audit trail. Configurable via team-settings.json `prReviewSeverity`. Read-only: never modifies code, never auto-merges. `--deep` escalates to opus | Phase 8 / FL-2 before merge; re-review after applying fixes |
| `/simplify` | Early returns, nesting depth, local duplication, dead code, magic values | After writing code (Phase 2); on demand |
| `/dependency-scan` | Route hrefs, import consumers, shared type consumers, test refs, FK refs, access control | Phase 1 mandatory; before finalizing file list |
| `/skill-review` | Skill quality audit: structural review, severity calibration, fix verification | After modifying skills; quarterly review cycle |
| `/context-review` | Phase 8.5 grep checks C1–C3: credential patterns, unresolved placeholders, field name staleness | Before `/compact` at end of block; C4–C12 judgment checks run in main session |

> **Before first run**: open each SKILL.md and replace the `[PLACEHOLDER]` values with the real paths for this project.
> **Prerequisites for screenshot-based skills**: dev server must be running (check your project's dev command for the URL).

---

## Git workflow

| Action | Command |
|---|---|
| New feature branch | `git checkout -b feature/block-name` |
| New fix branch | `git checkout -b fix/description` |
| Merge to staging | `git checkout staging && git merge feature/name --no-ff && git push` |
| Promote to production | `git checkout main && git merge staging --no-ff && git push` |

---

## Useful checks

```bash
# Verify type safety
[TYPE_CHECK_COMMAND]

# Run tests
[TEST_COMMAND]

# Check what Claude has touched in this session
cat ~/.claude/audit/[PROJECT_NAME].jsonl | tail -20 | jq .

# Validate Claude setup
npx mg-claude-dev-kit doctor
```
