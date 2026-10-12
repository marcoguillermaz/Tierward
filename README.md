# Tierward

[![npm version](https://img.shields.io/npm/v/tierward.svg)](https://www.npmjs.com/package/tierward)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js >= 22](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)
[![CI](https://github.com/marcoguillermaz/Tierward/actions/workflows/ci.yml/badge.svg)](https://github.com/marcoguillermaz/Tierward/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/marcoguillermaz/Tierward/badge)](https://securityscorecards.dev/viewer/?uri=github.com/marcoguillermaz/Tierward)

> **Claude generates. You or your team decides.**
> A development framework that gives Claude Code a governed, phased process, so you build real software consistently and reviewably, from day one.
> MCP-native: read Tierward governance state from Claude Desktop, ChatGPT, Cursor, VS Code.

Claude Code is fast. The problem it creates isn't in the code: it's in the review. When AI writes everything autonomously, you end up approving diffs you don't fully understand, catching regressions two blocks later, and losing the thread of what the system actually does.

**Tierward** sits between Claude and done. Teams adopt it tier by tier, from a zero-process discovery setup up to a fully governed pipeline: explicit STOP gates before implementation, audit skills that surface issues before they reach production, and a Stop hook that runs your tests when Claude says it is done and sends it back to fix them when they fail. Start at Tier 0 and move up when you need more structure.

Since v1.17.0, Tierward ships an MCP server alongside the CLI. Any MCP-aware client can read your project's doctor report, team-settings policy, last arch-audit, and skill inventory without running the Tierward CLI. See [MCP server](#mcp-server).

---

## Philosophy

One thing drives Tierward: Claude Code doesn't become harder to work with because it gets less capable. It becomes harder to work with because autonomous decisions accumulate faster than anyone can review them. The pipeline enforces a review contract: scope confirmed before code, hypothesis written before a fix, tests passing before done. It doesn't slow down work that doesn't need that structure.

The tier system exists because process has a cost. A solo bugfix shouldn't pay the overhead of a team feature workflow. Two pipelines cover the range: **Fast Lane** (4 steps, scope-confirm) for quick fixes, **Full** (14 phases, 4 review gates) for team features. Both enforce the same contract: Claude works phase by phase, your team approves each step. Start at the tier that fits your current risk and add more as the stakes rise.

Built for the people who carry the result, product managers and developers alike, so the decisions stay with them, not the model.

### Claude Code-first, by design

Tierward works exclusively with Claude Code. No Cursor support, no Copilot layer, no multi-tool abstractions. That's intentional.

The enforcement mechanisms that make Tierward useful are Claude Code primitives: a Stop hook is a hard OS-level block in `settings.json`; a STOP gate lives in `pipeline.md`, a rules file Claude reads at session start; audit skills are structured programs that run inside the Claude Code agent loop. These aren't portable concepts wrapped in an abstraction layer. They're direct calls into Claude Code's architecture.

Supporting multiple tools would mean replacing these with lowest-common-denominator abstractions that strip out the enforcement layer. The value of Tierward is precisely that enforcement: the Stop hook doesn't ask Claude to run tests, it prevents Claude from completing a task until they pass.

If your team uses other AI coding tools alongside Claude Code, Tierward governs only the Claude Code sessions. The underlying principles (tests before done, requirements before code, audit before deploy) aren't Claude-specific, but the implementation is, by choice.

---

## How it works

**1. Scaffold once.** `npx tierward init` detects your project type and scaffolds a pipeline, audit skills, security rules, and governance files matched to your stack and team size. Setup takes under two minutes.

**2. Work inside the pipeline.** The pipeline is a rules file Claude reads at session start. For Tier M: dependency scan before implementation, STOP gate after requirements, `/simplify` after writing code. You get the structure without managing it manually.

**3. Run audit skills on demand.** Skills like `/security-audit`, `/arch-audit`, and `/systematic-debugging` are multi-step programs that run inside Claude Code. Call them when you need them: before a deploy, when a test fails, after a migration wave. Each produces a structured report.

**4. You or your team decides.** STOP gates pause Claude to present its plan, and a commit gate blocks `git commit` until you have approved. On GitHub plans that support code owners, CODEOWNERS sends changes to `.claude/` to a human reviewer, and blocks the merge too when branch protection requires code owner review. A Stop hook also verifies your tests pass before a task can close. No autonomous merges.

---

## Quick Start

```bash
npx tierward init
```

The wizard detects your project state and routes setup. Three paths available:

| Path                   | Use when                                                         |
| ---------------------- | ---------------------------------------------------------------- |
| **Existing project**   | Add structure to a project that already has code                 |
| **New project**        | Starting from scratch                                            |
| **From existing docs** | Share repos or docs - Claude reads them and populates everything |

After init, open Claude Code and start working. The scaffold is active immediately.

### Context Builder (v1.27.0)

Run `context` before `init` if you want the scaffold to reproduce consistently, with a written record of what you asked for:

```bash
npx tierward context                       # produces CONTEXT.md
npx tierward init                          # reads CONTEXT.md, scaffolds with no further prompts
npx tierward context --all                 # one-shot: context then init
npx tierward context --from-yaml file.md   # bypass interview, validate + copy
npx tierward validate-context              # CI gate: exit 0/1 on schema check
```

`CONTEXT.md` is a schema-validated project context file. Greenfield runs a PM-friendly interview. Existing repos go through three-phase inference: algorithmic detection, LLM extraction, hybrid PM review. The first question routes you to a PM or developer flow. The developer flow reuses the technical questions from the legacy `init` wizards (projectName, stack, commands, scaffold options) and auto-derives `tier.rationale` from team size and work scope, so devs aren't asked to write PM rationale prose.

As of v1.27.0, the schema covers all four pipeline tiers: tier 0 (Discovery) and tier S (Fast Lane) for solo or bugfix work, tier M (Standard) for feature-block work with feature flags (`has_api`, `has_database`, `has_frontend`, `has_design_system`, `has_prd`), and tier L (Full) for complex domain projects.

---

## What it does

One contract across four tiers. Solo bugfix or fully governed team pipeline, the rule is the same: Claude proposes, your team approves.

### Tiered pipelines matched to risk

| Tier              | Pipeline                | Best for                              |
| ----------------- | ----------------------- | ------------------------------------- |
| **0 - Discovery** | Stop hook only          | First exploration - zero process      |
| **S - Fast Lane** | 4 steps, scope-confirm  | Single dev, low risk, quick fixes     |
| **M - Standard**  | 13 phases, 3 STOP gates | Feature blocks, 1-2 collaborators     |
| **L - Full**      | 14 phases, 4 STOP gates | Team projects, complex domain changes |

Start at Tier 0. Move up when you need more structure by re-running `init` with a higher tier ([how](docs/operational-guide.md#changing-tier)).

The wizard also asks how changes reach `main`: through a `staging` branch (the default for web stacks), by a `direct` local merge (the default for native apps), or by a pull request (`pr`), with no staging branch and no push to `main` ([promotion modes](docs/operational-guide.md#4d-how-changes-reach-main-promotion-modes)).

### 27 audit skills

Executable multi-step programs that run inside Claude Code, not prompt instructions. Structured audit workflows with model routing (haiku for mechanical checks, sonnet for analysis).

- **Every tier (8):** `/arch-audit`, `/security-audit`, `/perf-audit`, `/skill-dev`, `/simplify`, `/commit`, `/skill-security`, `/systematic-debugging`
- **Tier M and L add 18:** `/api-design`, `/skill-db`, `/migration-audit`, `/visual-audit`, `/ux-audit`, `/responsive-audit`, `/ui-audit`, `/accessibility-audit`, `/test-audit`, `/doc-audit`, `/api-contract-audit`, `/infra-audit`, `/compliance-audit`, `/dependency-audit`, `/pr-review`, `/skill-review`, `/dependency-scan`, `/repo-hygiene`
- **Tier L adds 1:** `/context-review`

Skills are conditionally installed based on your project: `hasApi`, `hasDatabase`, `hasFrontend`, `hasDesignSystem`. What each skill does, when it is installed and what it needs: [audit skills](docs/operational-guide.md#10-audit-skills).

### 11 tech stacks auto-detected

Node.js/TS, Node.js/JS, Python, Go, Swift, Kotlin, Rust, .NET, Ruby, Java - plus generic fallback. Security rules, permissions, and CLAUDE.md fields adapt automatically.

### MCP server (v1.17.0+)

The `tierward` package ships an MCP server (`tierward-mcp` binary) alongside the CLI, version-locked, single `npm install -g`. Any MCP-aware client (Claude Desktop, ChatGPT desktop, Cursor, VS Code, Copilot Studio) can query Tierward governance state without the Tierward CLI running. Six read-only tools cover the doctor report, team-settings, last arch-audit, skill inventory, package metadata, and `/pr-review` comments. Full reference in the [MCP server](#mcp-server) section below.

Tierward is also available as a [Claude Code plugin](https://claude.ai/code) in the Claude Code marketplace (v1.32.0+). The plugin adds eight governance skills to Claude Code: commit, arch-audit, security-audit, perf-audit, simplify, skill-dev, skill-security and humanize. The MCP server isn't part of it, so install the npm package if you need that. Install the plugin from inside Claude Code (2.1.275 or later):

```
/plugin install tierward --marketplace marcoguillermaz/Tierward
```

### Incremental adoption

Install individual components without a full scaffold:

```bash
npx tierward add skill security-audit   # install one skill
npx tierward add rule git                # install one rule
npx tierward add rule security           # install the security rule
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
│   ├── hooks/                   # Governance gates and the audit log hook
│   └── session/                 # Session recovery (gitignored)
├── docs/                        # Requirements, specs, backlog (M/L)
├── .github/                     # PR template, CODEOWNERS
└── .pre-commit-config.yaml      # Secret scanning
```

The Stop hook in `settings.json` is the enforcement mechanism. When Claude tries to finish a task, it runs your tests and sends Claude back to fix them if they fail. Present in every tier, including Discovery.

---

## CLI Commands

```bash
npx tierward init                    # scaffold wizard
npx tierward init --dry-run          # preview without writing
npx tierward init --answers file.json  # skip prompts (CI/automation)
npx tierward doctor                  # validate setup (27 checks)
npx tierward doctor --report         # JSON output for CI
npx tierward doctor --ci             # silent, exit 1 on failure
npx tierward upgrade                 # refresh safe files, show diffs for the rest
npx tierward upgrade --anthropic     # show diff for Anthropic-influenced files (dry-run)
npx tierward upgrade --anthropic --apply  # write the diff (with .bak backup)
npx tierward add skill <name>        # install one skill
npx tierward add rule <name>         # install one rule
npx tierward new skill               # create a custom skill (wizard)
tierward-mcp                            # MCP server (stdio); wire from .mcp.json
```

## MCP server

`tierward-mcp` is a Model Context Protocol server. It makes Tierward governance state readable by any MCP-aware client (Claude Desktop, ChatGPT desktop, Cursor, VS Code, Copilot Studio) through six read-only tools: doctor report, team settings, last arch-audit, skill inventory, package metadata and `/pr-review` comments. The CLI and MCP server ship in the same npm package, version-locked. The read-only posture is unchanged through v2.1.0.

In Claude Code, add it to a `.mcp.json` file at the project root to share it with your team, or wire it for yourself across projects:

```bash
claude mcp add --transport stdio --scope user tierward -- tierward-mcp
```

Tool reference, the `.mcp.json` snippet and project-root resolution: [MCP server](docs/operational-guide.md#mcp-server).

---

## Process controls

**Stop hook** (every tier) - when Claude tries to finish, the hook runs your tests and blocks the stop if they fail, so Claude goes back to fix them. If Claude stops again in the same turn, the hook lets it through, so a failure it cannot fix does not loop ([how it works](docs/operational-guide.md#stop-hook)).

**STOP gates** (Tier M/L) - Requirements reviewed before implementation. Spec-first or scope-confirm mode auto-selected per block.

**Promotion gate** (Tier S/M/L) - While a block or fix is in progress, the governance gate holds a promotion until you reply with a bare `Promote`, one promotion per keyword. A push to `staging` or `main` counts, and so does a pull request merge (`gh pr merge` or a GitHub MCP merge tool). The gate reads the commands Claude runs, so a few forms escape it, such as a merge through the REST API ([details](docs/operational-guide.md#4d-how-changes-reach-main-promotion-modes)).

**Audit logging** - File writes and edits (plus shell commands on Tier M/L) appended to `~/.claude/audit/<project>.jsonl` on your machine ([details](docs/operational-guide.md#audit-log)).

**AI attribution** - Every Claude-assisted commit tagged with `Co-authored-by`.

**Weekly arch-audit** - SessionStart hook checks if `/arch-audit` ran in the last 7 days.

**CODEOWNERS** - Pull requests that change `.claude/` request the tech lead's review. The review becomes mandatory only when branch protection or a ruleset enables "Require review from Code Owners". GitHub supports code owners in public repositories on every plan, and in private repositories only on Pro, Team and Enterprise plans.

---

## Testing

```bash
node packages/cli/test/integration/run.js    # 1171 integration checks
node --test 'packages/cli/test/unit/**/*.test.js'   # 596 unit tests
```

Covers: file structure per tier, Stop hook presence, pipeline gate counts, placeholder resolution, skill pruning, native stack adaptation, rubric scoring, cross-stack content invariants (10 stacks, the named stacks excluding the `other` fallback), golden-file assertions (Swift, Node-TS, Python), full CLI execution via `--answers` fixtures.

A separate **template-coverage** layer (under `packages/cli/test/template-coverage/`) hard-fails on cross-tier semantic drift, missing gate clauses, and undocumented placeholders in the shipped templates. The three scripts (`cross-tier-lint.mjs`, `gate-enum.mjs`, `placeholder-check.mjs`) run standalone for local work and automatically inside `run.js`. Strategy and concept registry: [docs/architecture/test-coverage-strategy.md](docs/architecture/test-coverage-strategy.md).

---

## Requirements

- Node.js >= 22
- [Claude Code CLI](https://claude.ai/code)
- Git

---

## Documentation

**[docs.tierward → marcoguillermaz.github.io/Tierward](https://marcoguillermaz.github.io/Tierward/)**: Quick start, tiers, skills reference, configuration.

| Document                                           | Audience                         | Content                                                        |
| -------------------------------------------------- | -------------------------------- | -------------------------------------------------------------- |
| [Custom Skills Guide](docs/custom-skills.md)       | Developers extending Tierward    | SKILL.md format, frontmatter schema, authoring patterns        |
| [Operational Guide](docs/operational-guide.md)     | Teams adopting Tierward          | Full reference: installation, tiers, workflow, governance, FAQ |
| [Quality Rubric](docs/workspace-quality-rubric.md) | Teams evaluating workspaces      | 8-dimension scoring (D1-D8, 0-100%)                            |

---

## Roadmap

See [GitHub Milestones](https://github.com/marcoguillermaz/Tierward/milestones) for the 12-month plan.

**Current**: v2.2.0 narrows what new projects let Claude run without asking. The allow list now names the git subcommands and the `npx` tools the pipeline uses, instead of allowing all of git, npx and curl. Skills wait for their own result again, which Claude Code stopped doing by default in v2.1.218. The template hooks now read their data the way Claude Code sends it, so the audit log records what Claude did, the Tier L destructive-command check fires, and the Stop hook's loop guard works. The hook logs and the temp files of `/pr-review` and `/dependency-audit` also stay out of the shared `/tmp`. v2.1.0 lets each project choose how changes reach `main` (through a `staging` branch, by merging directly, or only through a pull request) and moved the audit model baseline to the current Claude models. v2.0.1 and v2.0.2 fixed the generated pre-commit config, stopped `tierward upgrade` from overwriting files the scaffold fills in, and taught the governance gate to read the commands a call actually runs. v2.0.0 merged the platform-specific security context files into a single neutral `security.md`, the breaking change behind the major bump, and added the `/repo-hygiene` cleanup sweep.

**Next**: `/arch-audit` MCP-aware once the upstream Anthropic spec MCP server lands. `/privacy-audit` re-eval (Issue #97 sub-track 3) when AST tracing matures or a demand signal materializes.

---

## Support

Tierward is open-source, MIT-licensed, and built in the open. If it's useful to your team:

- ❤️ [**Sponsor on GitHub**](https://github.com/sponsors/marcoguillermaz): fund ongoing development, recurring or one-time
- ☕ [**Buy Me a Coffee**](https://buymeacoffee.com/marcoguillermaz): one-off support, no account needed
- ⭐ **Star the repo**: it helps other product and engineering teams discover the project
- 🐛 [**Open an issue**](https://github.com/marcoguillermaz/Tierward/issues) or [**start a discussion**](https://github.com/marcoguillermaz/Tierward/discussions)
- 🔧 **Send a pull request**: see [Contributing](#contributing) below

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, project structure, and PR guidelines.

To report a security issue, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)

---

Built and maintained by [Marco Guillermaz](https://github.com/marcoguillermaz). Distributed on npm as [`tierward`](https://www.npmjs.com/package/tierward). Discussions and questions: [GitHub Discussions](https://github.com/marcoguillermaz/Tierward/discussions).
