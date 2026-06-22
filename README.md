# Tierward

[![npm version](https://img.shields.io/npm/v/tierward.svg)](https://www.npmjs.com/package/tierward)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js >= 22](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)
[![CI](https://github.com/marcoguillermaz/Tierward/actions/workflows/ci.yml/badge.svg)](https://github.com/marcoguillermaz/Tierward/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/marcoguillermaz/Tierward/badge)](https://securityscorecards.dev/viewer/?uri=github.com/marcoguillermaz/Tierward)

> **Claude generates. Your team decides.**
> An open-source scaffold that brings AI-assisted coding into your team — for the product managers and developers who own the outcome — without giving up control of it.
> MCP-native — read Tierward governance state from Claude Desktop, ChatGPT, Cursor, VS Code.

Claude Code is fast. The gap it creates is not in the code: it is in the review. When AI writes everything autonomously, you end up approving diffs you don't fully understand, catching regressions two blocks later, and losing the thread of what the system actually does.

**Tierward** closes that gap. Instead of going all-in overnight, teams adopt it tier by tier — from a light discovery setup to a fully governed pipeline — with enforcement baked in from day one: explicit STOP gates before implementation, audit skills that surface issues before they reach production, and a Stop hook that mechanically prevents Claude from declaring done until your tests pass. Start at Tier 0 with zero process, move up when you need it.

Since v1.17.0, Tierward ships an MCP server alongside the CLI. Any MCP-aware client can read your project's doctor report, team-settings policy, last arch-audit, and skill inventory without running the Tierward CLI. See [MCP server](#mcp-server).

---

## Philosophy

One thing drives Tierward: Claude Code doesn't become harder to work with because it gets less capable. It becomes harder to work with because autonomous decisions accumulate faster than anyone can review them. The pipeline enforces a review contract — requirements before code, hypothesis before fix, tests before done — without slowing down work that doesn't need that structure.

The tier system exists because process has a cost. A solo bugfix should not pay the overhead of a team feature workflow. Two pipelines cover the range: **Fast Lane** (4 steps, scope-confirm) for quick fixes, **Full** (14 phases, 4 review gates) for team features. Both enforce the same contract — Claude works phase by phase, your team approves each step. Start at the tier that fits your current risk and add more as the stakes rise.

It is built for the people who carry the result — product managers and developers alike — so the decisions stay with them, not the model.

---

## How it works

**1. Scaffold once.** `npx tierward init` detects your project type and scaffolds a pipeline, audit skills, security rules, and governance files matched to your stack and team size. The whole setup takes under two minutes.

**2. Work inside the pipeline.** The pipeline is a rules file Claude reads at session start. For Tier M, that means: dependency scan before implementation, STOP gate after requirements, `/simplify` after writing code. You get the structure without managing it manually.

**3. Run audit skills on demand.** Skills like `/security-audit`, `/arch-audit`, and `/systematic-debugging` are multi-step programs that run inside Claude Code. Call them when you need them: before a deploy, when a test fails, after a migration wave. Each produces a structured report.

**4. Your team decides.** STOP gates pause Claude and present findings. CODEOWNERS guards `.claude/`. The Stop hook enforces test passage mechanically. No autonomous merges.

---

## Quick Start

```bash
npx tierward init
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
npx tierward context                       # produces CONTEXT.md
npx tierward init                          # reads CONTEXT.md, scaffolds with no further prompts
npx tierward context --all                 # one-shot: context then init
npx tierward context --from-yaml file.md   # bypass interview, validate + copy
npx tierward validate-context              # CI gate: exit 0/1 on schema check
```

`CONTEXT.md` is a schema-validated project context file. Greenfield runs a PM-friendly interview. Existing repos go through three-phase inference: algorithmic detection, LLM extraction, hybrid PM review. The first question routes you to a PM or developer flow. The developer flow reuses the technical questions from the legacy `init` wizards (projectName, stack, commands, scaffold options) and auto-derives `tier.rationale` from team size + work scope, so devs aren't asked to write PM rationale prose.

As of v1.27.0, the schema covers all four pipeline tiers: tier 0 (Discovery) and tier S (Fast Lane) for solo or bugfix work, tier M (Standard) for feature-block work with feature flags (`has_api`, `has_database`, `has_frontend`, `has_design_system`, `has_prd`), and tier L (Full) for complex domain projects.

---

## What it does

One contract across four tiers — from a solo bugfix to a fully governed team pipeline. Claude proposes, your team approves, at every tier.

### Tiered pipelines matched to risk

| Tier              | Pipeline                | Best for                              |
| ----------------- | ----------------------- | ------------------------------------- |
| **0 - Discovery** | Stop hook only          | First exploration - zero process      |
| **S - Fast Lane** | 4 steps, scope-confirm  | Single dev, low risk, quick fixes     |
| **M - Standard**  | 8 phases, 2 STOP gates  | Feature blocks, 1-2 collaborators     |
| **L - Full**      | 14 phases, 4 STOP gates | Team projects, complex domain changes |

Start at Tier 0. Move up when you need more structure: `npx tierward upgrade --tier=m`

### 26 audit skills

Executable multi-step programs that run inside Claude Code. Not prompt instructions. Structured audit workflows with model routing (haiku for mechanical checks, sonnet for analysis).

| Skill                   | Tiers | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/arch-audit`           | S M L | Governance files vs Anthropic docs. Auto-fixes deprecations.                                                                                                                                                                                                                                                                                                                                                                                    |
| `/security-audit`       | S M L | Auth, input validation, RLS, CVE scan. 3-path: WEB / NATIVE / HYBRID. **MCP-aware (v1.20+)**: Step 3c queries `mcp-nvd` server for live CVE data with local audit fallback.                                                                                                                                                                                                                                                                     |
| `/perf-audit`           | S M L | Bundle size, serial awaits, query efficiency. 8-stack patterns.                                                                                                                                                                                                                                                                                                                                                                                 |
| `/skill-dev`            | S M L | Coupling, duplication, dead code, debt-density. **Step 3b (v1.22+)**: hotspot priority via churn × debt — top-10 ranked by 4-quadrant matrix using `git log --since="6.months.ago"`.                                                                                                                                                                                                                                                            |
| `/simplify`             | S M L | Early returns, nesting, dead code. Applies changes directly.                                                                                                                                                                                                                                                                                                                                                                                    |
| `/commit`               | S M L | Conventional Commits - auto-detects type, scope, description.                                                                                                                                                                                                                                                                                                                                                                                   |
| `/skill-security`       | S M L | Security scan for Claude Code skills using SkillSpector: prompt injection, data exfiltration, MCP tool poisoning, supply chain, taint tracking. 64-pattern vulnerability scanner.                                                                                                                                                                                                                                                               |
| `/systematic-debugging` | S M L | Root-cause investigation before any fix: reproduce consistently, write the hypothesis, verify against evidence, then fix the root cause — not the symptom. STOP gate between hypothesis and fix.                                                                                                                                                                                                                                                 |
| `/api-design`           | M L   | URL naming, HTTP verbs, response envelope, pagination.                                                                                                                                                                                                                                                                                                                                                                                          |
| `/skill-db`             | M L   | Schema normalization, indexes, N+1 queries, RLS.                                                                                                                                                                                                                                                                                                                                                                                                |
| `/migration-audit`      | M L   | Stack-aware migration safety: data loss, rollback, lock-heavy DDL. Prisma/Drizzle/Supabase/SQL.                                                                                                                                                                                                                                                                                                                                                 |
| `/visual-audit`         | M L   | Typography, spacing, hierarchy, dark-mode, micro-polish.                                                                                                                                                                                                                                                                                                                                                                                        |
| `/ux-audit`             | M L   | ISO 9241-11, Nielsen heuristics, user confidence.                                                                                                                                                                                                                                                                                                                                                                                               |
| `/responsive-audit`     | M L   | Layout at 320-1024px, tap targets, WCAG.                                                                                                                                                                                                                                                                                                                                                                                                        |
| `/ui-audit`             | M L   | Design token compliance, component adoption, empty states.                                                                                                                                                                                                                                                                                                                                                                                      |
| `/accessibility-audit`  | M L   | axe-core WCAG 2.2, APCA contrast, static a11y (aria, tabindex, focus, labels).                                                                                                                                                                                                                                                                                                                                                                  |
| `/test-audit`           | M L   | Coverage (lcov/Istanbul/Cobertura/go/tarpaulin/xcresult), pyramid shape, anti-patterns (`.only`, skipped, empty, no-assertion, sleeps).                                                                                                                                                                                                                                                                                                         |
| `/doc-audit`            | M L   | Doc drift: link resolution, code-block syntax (json/yaml/toml), Tierward placeholder residuals, slash-command name match, skill-count consistency, ADR freshness, stack-sync (Next.js/Django/Swift).                                                                                                                                                                                                                                            |
| `/api-contract-audit`   | M L   | OpenAPI contract drift (endpoints, schemas, status), breaking-change detection vs previous spec, versioning consistency, security scheme alignment, Richardson Maturity L0-L3 scoring. Auto-gen for FastAPI / NestJS / Express+swagger-jsdoc / Next.js route handlers / Django REST.                                                                                                                                                            |
| `/infra-audit`          | M L   | Infrastructure security across GitHub Actions (pwn-request, secret logging, pinning, permissions), Dockerfile (root, latest tag, URL add), K8s (runAsNonRoot, privileged, hostNetwork), Terraform (IAM wildcards, state in git), GitLab CI. Stack-agnostic.                                                                                                                                                                                     |
| `/compliance-audit`     | M L   | GDPR profile: data-subject rights (delete, export, rectify), consent, lawful basis, PII identification, encryption-at-rest on special-category, logging hygiene, retention, sub-processors. SOC 2 / HIPAA scaffolded for v1.15+.                                                                                                                                                                                                                |
| `/dependency-audit`     | M L   | Outdated package audit: Tier A (safe batch) / B (non-core major) / C (core/breaking-risk) classification, changelog summary for Tier B/C, codebase impact grep, runtime LTS status. Stack-aware (node-ts/python/swift); agnostic fallback for other stacks. Audit-only in v1. **MCP-aware (v1.20+)**: Step 2 queries `package-registry-mcp` for multi-ecosystem package metadata with WebFetch fallback.                                       |
| `/pr-review`            | M L   | Autonomous local PR review via gh CLI: spawns review subagent on the diff, classifies findings (Critical / Major / Minor) using universal + stack-specific severity criteria, posts review as PR comment for audit trail. Configurable via team-settings.json `prReviewSeverity`. Read-only. `--deep` escalates to opus for sensitive changes. Also exposed as `tierward_pr_review` MCP tool.                                                        |
| `/skill-review`         | M L   | Quality review pipeline for skill portfolios. Spec compliance, cross-tier coherence, behavioral fixtures.                                                                                                                                                                                                                                                                                                                                       |
| `/dependency-scan`      | M L   | Pipeline-integrated (Phase 1): forked-context scan that returns the full file list — routes, components, shared types, DB tables — fed into the Phase 1 STOP gate. Six structurally independent checks (C1–C6) with a "Mandatory additions" section.                                                                                                                                                                                            |
| `/context-review`       | L     | Pipeline-integrated (Phase 8.5): forked-context review that runs after block closure to recompact `CLAUDE.md` and detect context drift before the next block opens. Tier L only.                                                                                                                                                                                                                                                                |

Skills are conditionally installed based on your project: `hasApi`, `hasDatabase`, `hasFrontend`, `hasDesignSystem`.

### 11 tech stacks auto-detected

Node.js/TS, Node.js/JS, Python, Go, Swift, Kotlin, Rust, .NET, Ruby, Java - plus generic fallback. Security rules, permissions, and CLAUDE.md fields adapt automatically.

### MCP server (v1.17.0+)

The `tierward` package ships an MCP server (`tierward-mcp` binary) alongside the CLI, version-locked, single `npm install -g`. Any MCP-aware client (Claude Desktop, ChatGPT desktop, Cursor, VS Code, Copilot Studio) can query Tierward governance state without the Tierward CLI running. Six read-only tools cover doctor report, team-settings, last arch-audit, skill inventory, package metadata, and `/pr-review` comments. Full reference in the [MCP server](#mcp-server) section below.

Tierward is also available as a [Claude Code plugin](https://claude.ai/code) in the Claude Code marketplace (v1.32.0+). Install from the marketplace to get the Tierward MCP server wired up automatically alongside your Claude Code installation.

### Incremental adoption

Install individual components without a full scaffold:

```bash
npx tierward add skill security-audit   # install one skill
npx tierward add rule git                # install one rule
npx tierward add rule security --stack swift  # stack-specific variant
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
│   └── .mcp.json                # Wire tierward-mcp into MCP-aware clients (v1.17+)
├── docs/                        # Requirements, specs, backlog (M/L)
├── .github/                     # PR template, CODEOWNERS
└── .pre-commit-config.yaml      # Secret scanning
```

The Stop hook in `settings.json` is the core enforcement mechanism. It blocks Claude from completing any task until tests pass. Present in every tier, including Discovery.

---

## CLI Commands

```bash
npx tierward init                    # scaffold wizard
npx tierward init --dry-run          # preview without writing
npx tierward init --answers file.json  # skip prompts (CI/automation)
npx tierward doctor                  # validate setup (29 checks)
npx tierward doctor --report         # JSON output for CI
npx tierward doctor --ci             # silent, exit 1 on failure
npx tierward upgrade                 # update template files
npx tierward upgrade --tier=m        # promote to higher tier
npx tierward upgrade --anthropic     # show diff for Anthropic-influenced files (dry-run)
npx tierward upgrade --anthropic --apply  # write the diff (with .bak backup)
npx tierward add skill <name>        # install one skill
npx tierward add rule <name>         # install one rule
npx tierward new skill               # create a custom skill (wizard)
tierward-mcp                            # MCP server (stdio); wire from .mcp.json
```

## MCP server

`tierward-mcp` is a Model Context Protocol server that makes Tierward governance state readable by any MCP-aware client (Claude Desktop, ChatGPT desktop, Cursor, VS Code, Copilot Studio). The CLI and MCP server ship in the same npm package, version-locked.

Wire it up by adding to `.mcp.json` (project-scoped) or `~/.claude/.mcp.json` (user-scoped):

```json
{
  "mcpServers": {
    "tierward": { "command": "tierward-mcp" }
  }
}
```

Read-only tools exposed:

| Tool                    | Returns                                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tierward_doctor_report`     | `doctor --report` JSON (29 checks)                                                                                                                                    |
| `tierward_team_settings`     | parsed `.claude/team-settings.json`                                                                                                                                   |
| `tierward_arch_audit_status` | last `arch-audit` run timestamp + age                                                                                                                                 |
| `tierward_skill_inventory`   | installed skills + frontmatter snapshot                                                                                                                               |
| `tierward_package_meta`      | Tierward package name, version, CLI path, cwd                                                                                                                         |
| `tierward_pr_review`         | reads existing `/pr-review` skill comments on a GitHub PR (verdict, severity counts). Read-only — to generate a fresh review, invoke the `/pr-review` Tierward skill. |

*Note: The legacy `cdk_*` tool names remain available as deprecated aliases for backwards compatibility.*

The server resolves the project root from `$TIERWARD_PROJECT_ROOT` (or the legacy `$CDK_PROJECT_ROOT`) if set, otherwise from `process.cwd()`. v1.17.0 launched read-only by design; that posture is unchanged through v1.33.0.

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
node packages/cli/test/integration/run.js    # 1170 integration checks
node --test 'packages/cli/test/unit/**/*.test.js'   # 585 unit tests
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

| Document                                           | Audience                         | Content                                                        |
| -------------------------------------------------- | -------------------------------- | -------------------------------------------------------------- |
| [Operational Guide](docs/operational-guide.md)     | Teams adopting Tierward          | Full reference: installation, tiers, workflow, governance, FAQ |
| [Custom Skills Guide](docs/custom-skills.md)       | Developers extending Tierward    | SKILL.md format, frontmatter schema, authoring patterns        |
| [Product Brief](docs/product-brief.md)             | Stakeholders                     | Strategic positioning, target users, scope                     |
| [Quality Rubric](docs/workspace-quality-rubric.md) | Teams evaluating workspaces      | 8-dimension scoring (D1-D8, 0-100%)                            |

---

## Roadmap

See [GitHub Milestones](https://github.com/marcoguillermaz/Tierward/milestones) for the 12-month plan.

**Current**: v1.33.1 adds an output-style language rule (code identifiers, paths, and commands stay verbatim across response languages) and extends `doctor` validation to tier 0. v1.33.0 adds `/systematic-debugging` (tier S+): root-cause enforcement with a STOP gate between hypothesis and fix, Red Flags anti-rationalization tables, and pipeline hooks in tier M/L. v1.32.0 ships the Tierward plugin for the Claude Code marketplace and a bootstrap soft hook for plugin-installed projects. v1.31.0 ships the VS Code extension (P1–P3): governance tree view with skill and rule browsing, live health status bar with arch-audit staleness, and Tierward doctor findings surfaced as Problems panel diagnostics. Also adds `/skill-security` (SkillSpector integration, tier S+), a 64-pattern vulnerability scanner for Claude Code skill files.

**Next**: `/arch-audit` MCP-aware once the upstream Anthropic spec MCP server lands. `/privacy-audit` re-eval (Issue #97 sub-track 3) when AST tracing matures or demand signal materializes. Q2 #3 VitePress docs site (ICE 432) stays on hold.

---

## Support

Tierward is open-source, MIT-licensed, and built in the open. If it's useful to your team, here's how to support it:

- ❤️ [**Sponsor on GitHub**](https://github.com/sponsors/marcoguillermaz) — fund ongoing development, recurring or one-time
- ☕ [**Buy Me a Coffee**](https://www.buymeacoffee.com/marcoguillermaz) — one-off support, no account needed
- ⭐ **Star the repo** — it helps other product and engineering teams discover the project
- 🐛 [**Open an issue**](https://github.com/marcoguillermaz/Tierward/issues) or [**start a discussion**](https://github.com/marcoguillermaz/Tierward/discussions)
- 🔧 **Send a pull request** — see [Contributing](#contributing) below

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, project structure, and PR guidelines.

To report a security issue, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)

---

Built and maintained by [Marco Guillermaz](https://github.com/marcoguillermaz). Distributed on npm as [`tierward`](https://www.npmjs.com/package/tierward). Discussions and questions: [GitHub Discussions](https://github.com/marcoguillermaz/Tierward/discussions).
