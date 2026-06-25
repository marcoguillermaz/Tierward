# Tierward

Governed AI coding, built exclusively for Claude Code: tiered pipelines, audit skills, and a Stop hook that mechanically blocks task completion until your tests pass.

> **Claude Code-only.** Tierward's enforcement layer — Stop hook, STOP gates, audit skills — is built on Claude Code primitives and does not support other AI coding tools. See [why](https://marcoguillermaz.github.io/Tierward/guide/quick-start) in the docs.

```bash
npx tierward init
```

---

## What it does

Claude Code is fast. The gap it creates is not in the code; it is in the review. When an AI agent writes autonomously, decisions accumulate faster than anyone can verify them. Tierward closes that gap by enforcing a review contract directly in the development session, not as a prompt Claude may or may not follow, but as a process it cannot bypass.

The Stop hook is a shell command in `.claude/settings.json`. When Claude tries to declare a task done, the hook runs your test suite. If tests fail, Claude is blocked and has to keep working. This is not a rule. It is control flow.

STOP gates in the pipeline work the same way: Claude stops before implementation, presents its plan, and waits for explicit confirmation before writing any code. CODEOWNERS prevents anyone from modifying `.claude/` without a human reviewer.

## Quick start

```bash
# Add Tierward to an existing project
npx tierward init

# Validate the scaffold
npx tierward doctor

# Check for Anthropic spec drift
npx tierward upgrade --anthropic --dry-run
```

The wizard detects your tech stack and scaffolds the right configuration. Runs in about two minutes.

## Four tiers

Start at the lowest tier that covers your risk. Move up when you need more structure.

| Tier | Pipeline | Best for |
| --- | --- | --- |
| **0 — Discovery** | Stop hook only | First exploration, zero process |
| **S — Fast Lane** | 4 steps, scope-confirm | Solo dev, low-risk fixes |
| **M — Standard** | 13 phases, 3 STOP gates | Feature blocks, 1–2 collaborators |
| **L — Full** | 14 phases, 4 STOP gates | Team projects, complex domain work |

## What gets scaffolded

- **`CLAUDE.md`** — project context Claude reads at session start (stack, commands, conventions)
- **`.claude/settings.json`** — Stop hook, permissions allow/deny list, audit log hooks
- **`.claude/rules/pipeline.md`** — the development pipeline Claude follows, phase by phase
- **`.claude/rules/security.md`** — stack-aware security rules (11 stacks supported)
- **`.claude/skills/`** — audit slash-commands: `/arch-audit`, `/security-audit`, `/systematic-debugging`, and more
- **`.github/CODEOWNERS`** — gates `.claude/` changes behind human review
- **`team-settings.json`** (opt-in) — enforce `minTier`, `allowedSkills`, `blockedSkills` across every team clone

## Audit skills

26 executable multi-step programs that run inside Claude Code. Not one-shot prompts: structured workflows with STOP gates, model routing (haiku for mechanical checks, sonnet for analysis), and structured output.

`/security-audit` `/arch-audit` `/doc-audit` `/test-audit` `/accessibility-audit` `/compliance-audit` `/api-contract-audit` `/infra-audit` `/dependency-audit` `/perf-audit` `/visual-audit` `/responsive-audit` `/ux-audit` `/migration-audit` `/pr-review` `/systematic-debugging` `/simplify` and more.

## MCP server

```bash
npx -y --package=tierward tierward-mcp
```

Or install from the MCP registry: `io.github.marcoguillermaz/tierward`

Six read-only tools expose governance state to any MCP-aware client (doctor report, team settings, arch-audit status, skill inventory, package metadata) without the CLI running.

## Supported stacks

Node.js/TypeScript, Node.js/JavaScript, Python, Go, Swift/macOS/iOS, Kotlin/Android, Rust, .NET/C#, Ruby, Java, and a generic fallback.

Stack detection is automatic at init. Security rules, permissions, audit skill configuration, and Stop hook defaults adapt to your stack.

## VS Code extension

Install **Tierward** from the VS Code Marketplace. Auto-wires the MCP server and Claude Code plugin.

## Requirements

- Node.js >= 22
- Claude Code CLI

## Documentation

**[marcoguillermaz.github.io/Tierward](https://marcoguillermaz.github.io/Tierward/)** — quick start, tiers, skill reference, configuration.

Source and full changelog: [github.com/marcoguillermaz/Tierward](https://github.com/marcoguillermaz/Tierward)

## License

MIT
