# claude-dev-kit

[![npm version](https://img.shields.io/npm/v/mg-claude-dev-kit.svg)](https://www.npmjs.com/package/mg-claude-dev-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js >= 22](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)
[![CI](https://github.com/marcoguillermaz/claude-dev-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/marcoguillermaz/claude-dev-kit/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/marcoguillermaz/claude-dev-kit/badge)](https://securityscorecards.dev/viewer/?uri=github.com/marcoguillermaz/claude-dev-kit)

> Scaffold for legible, reviewable AI-assisted development.
> Claude generates. Your team decides.
> MCP-native — read CDK governance state from Claude Desktop, ChatGPT, Cursor, VS Code.

Claude Code is a powerful CLI that reads, writes, and reasons about your entire codebase. Without shared process, it makes autonomous decisions that are hard to track and harder to review.

**claude-dev-kit** scaffolds a structured, reviewable development process on top of Claude Code. It enforces one non-negotiable rule mechanically: Claude cannot declare a task complete until your tests pass. Everything else scales with your needs.

Since v1.17.0, CDK ships an MCP server alongside the CLI. Any MCP-aware client can read your project's doctor report, team-settings policy, last arch-audit, and skill inventory without anyone running the CDK CLI. See [MCP server](#mcp-server).

---

## Quick Start

```bash
npx mg-claude-dev-kit init
```

The wizard detects your project state and guides you through setup. Three paths available:

| Path                   | Use when                                                         |
| ---------------------- | ---------------------------------------------------------------- |
| **Existing project**   | Add structure to a project that already has code                 |
| **New project**        | Starting from scratch                                            |
| **From existing docs** | Share repos or docs - Claude reads them and populates everything |

After init, open Claude Code and start working. The scaffold is active immediately.

### Context Builder (v1.27.0)

Run `context` before `init` if you want the scaffold to come out the same way every time, with a written record of what you asked for:

```bash
npx mg-claude-dev-kit context                       # produces CONTEXT.md
npx mg-claude-dev-kit init                          # reads CONTEXT.md, scaffolds with no further prompts
npx mg-claude-dev-kit context --all                 # one-shot: context then init
npx mg-claude-dev-kit context --from-yaml file.md   # bypass interview, validate + copy
npx mg-claude-dev-kit validate-context              # CI gate: exit 0/1 on schema check
```

`CONTEXT.md` is a schema-validated project context file. Greenfield runs a PM-friendly interview. Existing repos go through three-phase inference: algorithmic detection, LLM extraction, hybrid PM review. The first question routes you to a PM or developer flow. The developer flow reuses the technical questions from the legacy `init` wizards (projectName, stack, commands, scaffold options) and auto-derives `tier.rationale` from team size + work scope, so devs are not asked to write PM rationale prose.

As of v1.27.0, the schema covers all four pipeline tiers: tier 0 (Discovery) and tier S (Fast Lane) for solo or bugfix work, tier M (Standard) for feature-block work with feature flags (`has_api`, `has_database`, `has_frontend`, `has_design_system`, `has_prd`), and tier L (Full) for complex domain projects.

---

## What it does

### Tiered pipelines matched to risk

| Tier              | Pipeline                | Best for                              |
| ----------------- | ----------------------- | ------------------------------------- |
| **0 - Discovery** | Stop hook only          | First exploration - zero process      |
| **S - Fast Lane** | 4 steps, scope-confirm  | Single dev, low risk, quick fixes     |
| **M - Standard**  | 8 phases, 2 STOP gates  | Feature blocks, 1-2 collaborators     |
| **L - Full**      | 14 phases, 4 STOP gates | Team projects, complex domain changes |

Start at Tier 0. Move up when you need more structure: `npx mg-claude-dev-kit upgrade --tier=m`

### 24 audit skills

Executable multi-step programs that run inside Claude Code. Not prompt instructions - structured audit workflows with model routing (haiku for mechanical checks, sonnet for analysis).

| Skill                  | Tiers | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/arch-audit`          | S M L | Governance files vs Anthropic docs. Auto-fixes deprecations.                                                                                                                                                                                                                                                                                                                                                                                   |
| `/security-audit`      | S M L | Auth, input validation, RLS, CVE scan. 3-path: WEB / NATIVE / HYBRID. **MCP-aware (v1.20+)**: Step 3c queries `mcp-nvd` server for live CVE data with local audit fallback.                                                                                                                                                                                                                                                                    |
| `/perf-audit`          | S M L | Bundle size, serial awaits, query efficiency. 8-stack patterns.                                                                                                                                                                                                                                                                                                                                                                                |
| `/skill-dev`           | S M L | Coupling, duplication, dead code, debt-density. **Step 3b (v1.22+)**: hotspot priority via churn × debt — top-10 ranked by 4-quadrant matrix using `git log --since="6.months.ago"`.                                                                                                                                                                                                                                                           |
| `/simplify`            | S M L | Early returns, nesting, dead code. Applies changes directly.                                                                                                                                                                                                                                                                                                                                                                                   |
| `/commit`              | S M L | Conventional Commits - auto-detects type, scope, description.                                                                                                                                                                                                                                                                                                                                                                                  |
| `/api-design`          | M L   | URL naming, HTTP verbs, response envelope, pagination.                                                                                                                                                                                                                                                                                                                                                                                         |
| `/skill-db`            | M L   | Schema normalization, indexes, N+1 queries, RLS.                                                                                                                                                                                                                                                                                                                                                                                               |
| `/migration-audit`     | M L   | Stack-aware migration safety: data loss, rollback, lock-heavy DDL. Prisma/Drizzle/Supabase/SQL.                                                                                                                                                                                                                                                                                                                                                |
| `/visual-audit`        | M L   | Typography, spacing, hierarchy, dark-mode, micro-polish.                                                                                                                                                                                                                                                                                                                                                                                       |
| `/ux-audit`            | M L   | ISO 9241-11, Nielsen heuristics, user confidence.                                                                                                                                                                                                                                                                                                                                                                                              |
| `/responsive-audit`    | M L   | Layout at 320-1024px, tap targets, WCAG.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `/ui-audit`            | M L   | Design token compliance, component adoption, empty states.                                                                                                                                                                                                                                                                                                                                                                                     |
| `/accessibility-audit` | M L   | axe-core WCAG 2.2, APCA contrast, static a11y (aria, tabindex, focus, labels).                                                                                                                                                                                                                                                                                                                                                                 |
| `/test-audit`          | M L   | Coverage (lcov/Istanbul/Cobertura/go/tarpaulin/xcresult), pyramid shape, anti-patterns (`.only`, skipped, empty, no-assertion, sleeps).                                                                                                                                                                                                                                                                                                        |
| `/doc-audit`           | M L   | Doc drift: link resolution, code-block syntax (json/yaml/toml), CDK placeholder residuals, slash-command name match, skill-count consistency, ADR freshness, stack-sync (Next.js/Django/Swift).                                                                                                                                                                                                                                                |
| `/api-contract-audit`  | M L   | OpenAPI contract drift (endpoints, schemas, status), breaking-change detection vs previous spec, versioning consistency, security scheme alignment, Richardson Maturity L0-L3 scoring. Auto-gen for FastAPI / NestJS / Express+swagger-jsdoc / Next.js route handlers / Django REST.                                                                                                                                                           |
| `/infra-audit`         | M L   | Infrastructure security across GitHub Actions (pwn-request, secret logging, pinning, permissions), Dockerfile (root, latest tag, URL add), K8s (runAsNonRoot, privileged, hostNetwork), Terraform (IAM wildcards, state in git), GitLab CI. Stack-agnostic.                                                                                                                                                                                    |
| `/compliance-audit`    | M L   | GDPR profile: data-subject rights (delete, export, rectify), consent, lawful basis, PII identification, encryption-at-rest on special-category, logging hygiene, retention, sub-processors. SOC 2 / HIPAA scaffolded for v1.15+.                                                                                                                                                                                                               |
| `/dependency-audit`    | M L   | Outdated package audit: Tier A (safe batch) / B (non-core major) / C (core/breaking-risk) classification, changelog summary for Tier B/C, codebase impact grep, runtime LTS status. Stack-aware (node-ts/python/swift); agnostic fallback for other stacks. Audit-only in v1; mutating apply-tier-a deferred to Q4. **MCP-aware (v1.20+)**: Step 2 queries `package-registry-mcp` for multi-ecosystem package metadata with WebFetch fallback. |
| `/pr-review`           | M L   | Autonomous local PR review via gh CLI: spawns review subagent on the diff, classifies findings (Critical / Major / Minor) using universal + stack-specific severity criteria, posts review as PR comment for audit trail. Configurable via team-settings.json `prReviewSeverity`. Read-only. `--deep` escalates to opus for sensitive changes. Also exposed as `cdk_pr_review` MCP tool.                                                       |
| `/skill-review`        | M L   | Quality review pipeline for skill portfolios. Spec compliance, cross-tier coherence, behavioral fixtures.                                                                                                                                                                                                                                                                                                                                      |
| `/dependency-scan`     | M L   | Pipeline-integrated (Phase 1): forked-context scan that returns the full file list — routes, components, shared types, DB tables — fed into the Phase 1 STOP gate. Six structurally independent checks (C1–C6) with a "Mandatory additions" section.                                                                                                                                                                                           |
| `/context-review`      | L     | Pipeline-integrated (Phase 8.5): forked-context review that runs after block closure to recompact `CLAUDE.md` and detect context drift before the next block opens. Tier L only.                                                                                                                                                                                                                                                               |

Skills are conditionally installed based on your project: `hasApi`, `hasDatabase`, `hasFrontend`, `hasDesignSystem`.

### 11 tech stacks auto-detected

Node.js/TS, Node.js/JS, Python, Go, Swift, Kotlin, Rust, .NET, Ruby, Java - plus generic fallback. Security rules, permissions, and CLAUDE.md fields adapt automatically.

### MCP server (v1.17.0+)

The `mg-claude-dev-kit` package ships an MCP server (`claude-dev-kit-mcp` binary) alongside the CLI, version-locked, single `npm install -g`. Any MCP-aware client (Claude Desktop, ChatGPT desktop, Cursor, VS Code, Copilot Studio) can query CDK governance state without the CDK CLI running. Six read-only tools cover doctor report, team-settings, last arch-audit, skill inventory, package metadata, and `/pr-review` comments. Full reference in the [MCP server](#mcp-server) section below.

### Incremental adoption

Install individual components without a full scaffold:

```bash
npx mg-claude-dev-kit add skill security-audit   # install one skill
npx mg-claude-dev-kit add rule git                # install one rule
npx mg-claude-dev-kit add rule security --stack swift  # stack-specific variant
```

Custom skills (`custom-*` prefix) are preserved across upgrades. See [Custom Skills Guide](docs/custom-skills.md).

---

## Architecture

```
your-project/
├── CLAUDE.md                    # Project context (<200 lines)
├── .claude/
│   ├── settings.json            # Permissions + Stop hook (mechanical enforcement)
│   ├── team-settings.json       # Team policy: minTier / allowed / blocked / required (v1.16+)
│   ├── rules/
│   │   ├── pipeline.md          # Development workflow (tier-appropriate)
│   │   ├── security.md          # Stack-aware: web / apple / android / systems
│   │   ├── git.md               # Commit format, branch rules
│   │   └── output-style.md      # Communication rules
│   ├── skills/                  # Audit skills (conditional per project)
│   ├── session/                 # Session recovery (gitignored)
│   └── .mcp.json                # Wire claude-dev-kit-mcp into MCP-aware clients (v1.17+)
├── docs/                        # Requirements, specs, backlog (M/L)
├── .github/                     # PR template, CODEOWNERS
└── .pre-commit-config.yaml      # Secret scanning
```

The Stop hook in `settings.json` is the core enforcement mechanism. It blocks Claude from completing any task until tests pass. Present in every tier, including Discovery.

---

## CLI Commands

```bash
npx mg-claude-dev-kit init                    # scaffold wizard
npx mg-claude-dev-kit init --dry-run          # preview without writing
npx mg-claude-dev-kit init --answers file.json  # skip prompts (CI/automation)
npx mg-claude-dev-kit doctor                  # validate setup (29 checks)
npx mg-claude-dev-kit doctor --report         # JSON output for CI
npx mg-claude-dev-kit doctor --ci             # silent, exit 1 on failure
npx mg-claude-dev-kit upgrade                 # update template files
npx mg-claude-dev-kit upgrade --tier=m        # promote to higher tier
npx mg-claude-dev-kit upgrade --anthropic     # show diff for Anthropic-influenced files (dry-run)
npx mg-claude-dev-kit upgrade --anthropic --apply  # write the diff (with .bak backup)
npx mg-claude-dev-kit add skill <name>        # install one skill
npx mg-claude-dev-kit add rule <name>         # install one rule
npx mg-claude-dev-kit new skill               # create a custom skill (wizard)
claude-dev-kit-mcp                            # MCP server (stdio); wire from .mcp.json
```

## MCP server

`claude-dev-kit-mcp` is a Model Context Protocol server that exposes CDK governance signals to any MCP-aware client (Claude Desktop, ChatGPT desktop, Cursor, VS Code, Copilot Studio). The CLI and MCP server ship in the same npm package, version-locked.

Wire it up by adding to `.mcp.json` (project-scoped) or `~/.claude/.mcp.json` (user-scoped):

```json
{
  "mcpServers": {
    "cdk": { "command": "claude-dev-kit-mcp" }
  }
}
```

Read-only tools exposed:

| Tool                    | Returns                                                                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cdk_doctor_report`     | `doctor --report` JSON (29 checks)                                                                                                                               |
| `cdk_team_settings`     | parsed `.claude/team-settings.json`                                                                                                                              |
| `cdk_arch_audit_status` | last `arch-audit` run timestamp + age                                                                                                                            |
| `cdk_skill_inventory`   | installed skills + frontmatter snapshot                                                                                                                          |
| `cdk_package_meta`      | CDK package name, version, CLI path, cwd                                                                                                                         |
| `cdk_pr_review`         | reads existing `/pr-review` skill comments on a GitHub PR (verdict, severity counts). Read-only — to generate a fresh review, invoke the `/pr-review` CDK skill. |

The server resolves the project root from `$CDK_PROJECT_ROOT` if set, otherwise from `process.cwd()`. v1.17.0 launched read-only by design; that posture is unchanged through v1.29.2.

---

## Process controls

**Stop hook** (every tier) - Claude cannot declare done until tests pass:

```json
"Stop": [{ "hooks": [{ "type": "command",
  "command": "npm test || echo '{\"decision\": \"block\", \"reason\": \"Tests must pass.\"}'"
}] }]
```

**STOP gates** (Tier M/L) - Requirements reviewed before implementation. Spec-first or scope-confirm mode auto-selected per block.

**Audit logging** - Every tool use appended to `~/.claude/audit/project.jsonl`.

**AI attribution** - Every Claude-assisted commit tagged with `Co-authored-by`.

**Weekly arch-audit** - SessionStart hook checks if `/arch-audit` ran in the last 7 days.

**CODEOWNERS** - Changes to `.claude/` require tech lead review.

---

## Testing

```bash
node packages/cli/test/integration/run.js    # 1132 integration checks
node --test packages/cli/test/unit/*.test.js   # 554 unit tests
```

Covers: file structure per tier, Stop hook presence, pipeline gate counts, placeholder resolution, skill pruning, security variant selection, native stack adaptation, rubric scoring, cross-stack content invariants (10 stacks — the named stacks excluding the `other` fallback), golden-file assertions (Swift, Node-TS, Python), full CLI execution via `--answers` fixtures.

A separate **template-coverage** layer (under `packages/cli/test/template-coverage/`) hard-fails on cross-tier semantic drift, missing gate clauses, and undocumented placeholders in the shipped templates. The three scripts (`cross-tier-lint.mjs`, `gate-enum.mjs`, `placeholder-check.mjs`) run standalone for local work and automatically inside `run.js`. Strategy and concept registry: [docs/architecture/test-coverage-strategy.md](docs/architecture/test-coverage-strategy.md).

---

## Requirements

- Node.js >= 22
- [Claude Code CLI](https://claude.ai/code)
- Git

---

## Documentation

| Document                                           | Audience                    | Content                                                        |
| -------------------------------------------------- | --------------------------- | -------------------------------------------------------------- |
| [Operational Guide](docs/operational-guide.md)     | Teams adopting CDK          | Full reference: installation, tiers, workflow, governance, FAQ |
| [Custom Skills Guide](docs/custom-skills.md)       | Developers extending CDK    | SKILL.md format, frontmatter schema, authoring patterns        |
| [Product Brief](docs/product-brief.md)             | Stakeholders                | Strategic positioning, target users, scope                     |
| [Quality Rubric](docs/workspace-quality-rubric.md) | Teams evaluating workspaces | 8-dimension scoring (D1-D8, 0-100%)                            |

---

## Roadmap

See [GitHub Milestones](https://github.com/marcoguillermaz/claude-dev-kit/milestones) for the 12-month plan.

**Current**: v1.29.2 lands the cross-LLM rubric automation for the Context Builder (shipped in v1.29.0, closing v1.1 P5): SHOULD-PASS scoring of `CONTEXT.md` now runs as a single maintainer command against the locked jury, with v1.29.1 fixing the npm-publish lockfile and v1.29.2 dropping the deprecated `temperature` param that 400'd on Opus. Carried forward: v1.28.0's skill-review pipeline P3 robustness (Phase 1→2 gate, behavioral-fixture coverage 6→11 skills, Phase 10 closure sweep), v1.27.0's Context Builder v1.1 cycle (schema-validated `CONTEXT.md` driving non-interactive scaffolding across all four tiers), v1.22.0's `/skill-dev` v2 hotspot step (churn × debt), v1.21.0's PreToolUse runtime enforcement, and v1.20.0's MCP-aware audit skills pinned to `mcp-nvd` and `package-registry-mcp`.

**Next**: `/arch-audit` MCP-aware once the upstream Anthropic spec MCP server lands. `/privacy-audit` re-eval (Issue #97 sub-track 3) when AST tracing matures or demand signal materializes. Q2 #3 VitePress docs site (ICE 432) stays on hold.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, project structure, and PR guidelines.

To report a security issue, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)

---

Built and maintained by [Marco Guillermaz](https://github.com/marcoguillermaz). Distributed on npm as [`mg-claude-dev-kit`](https://www.npmjs.com/package/mg-claude-dev-kit). Discussions and questions: [GitHub Discussions](https://github.com/marcoguillermaz/claude-dev-kit/discussions).
