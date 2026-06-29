# Claude Code - Files Guide

Reference guide for understanding each Claude Code file: official purpose, loading behaviour,
and how this project uses them.

---

## Overview

Claude Code reads a set of files to build its context before responding. Some are auto-loaded
at every session start; others are read on-demand or only when explicitly referenced.

```
Automatically loaded at session start
─────────────────────────────────────
CLAUDE.md                        ← project context (official, committed)
.claude/CLAUDE.local.md          ← personal overrides (official, gitignored)
.claude/rules/pipeline.md        ← workflow rules (official, committed)
.claude/rules/context-review.md  ← Phase 8.5 compliance checklist (official, committed)
.claude/settings.json            ← project tool permissions (official, committed)
.claude/settings.local.json      ← personal config overrides (official, gitignored)
~/.claude/projects/.../MEMORY.md ← auto-memory (Claude Code system, NOT committed)

Loaded on demand (adapt paths to your project)
─────────────────────────────────────
MEMORY.md (project root)         ← shared lessons (project convention - read in Phase 0)
docs/requirements.md             ← product spec (read in Phase 1)
docs/implementation-checklist.md ← progress tracker (read in Phase 1)
docs/refactoring-backlog.md      ← tech debt (read in Phase 1)
docs/prd/prd.md                  ← PRD source of truth (read in Phase 1; updated in Phase 8 - mandatory if exists)
docs/contracts/*.md              ← per-entity field×role×surface contracts (read in Phase 1, if applicable)
docs/sitemap.md                  ← route map (read by skills, updated in Phase 8; if applicable)
docs/db-map.md                   ← database schema map (read by /skill-db, updated in Phase 8; if applicable)
docs/migrations-log.md           ← migration history (read/written in Phase 2, if applicable)
```

---

## CLAUDE.md - Project context

**Official Anthropic feature**: yes - auto-loaded at every session start.

**What it is**: the "orientation brief" Claude reads before starting any task. It holds project
truths that cannot be inferred from the code alone: non-obvious architectural decisions, RBAC
rules, business workflow summaries, known gotchas, coding conventions.

**CLAUDE.md hierarchy** (all auto-loaded, in precedence order):

| Location | Scope | Committed? |
|---|---|---|
| `~/.claude/CLAUDE.md` | All projects on this machine (personal) | No |
| `CLAUDE.md` (project root) | This project, all team members | Yes |
| `.claude/CLAUDE.local.md` | This project, personal only | No (gitignored) |
| `subdir/CLAUDE.md` | That subdirectory only | Yes |

Each more-specific file takes precedence over broader ones.

**What belongs here**:
- Tech stack and non-obvious architecture choices
- RBAC roles and access rules
- Business workflows (state machines, document flow)
- Known gotchas that would cause bugs if forgotten
- Coding conventions that differ from defaults
- Pointers to other reference documents

**What does NOT belong here** (official Anthropic guidance):
- File-by-file codebase descriptions → Claude reads code with Glob/Read
- Things Claude can infer from reading the code
- Information that changes every block → use MEMORY.md
- Long explanations or tutorials
- Standard language conventions Claude already knows

**Anthropic's test for each line**: *"Would removing this cause Claude to make mistakes?"*
If no → cut it. Bloated CLAUDE.md files cause Claude to ignore actual instructions.

**When to update**: event-driven. Update only when a block introduces a non-obvious pattern,
changes RBAC, or adds a new coding convention. Not every block requires a CLAUDE.md update.

---

## .claude/rules/ - Modular rule files

**Official Anthropic feature**: yes - all `.md` files in this directory are auto-loaded
at session start, with the same priority as CLAUDE.md.

**What it is**: a way to split a large CLAUDE.md into focused, well-organised files.
Each file in `.claude/rules/` can cover a specific topic (workflow, API conventions, testing rules).

**Advanced feature**: rules files support YAML frontmatter with a `paths` field for
path-specific rules (e.g. a rule that applies only to `e2e/*.spec.ts` files).

**This project uses it for**:
- `pipeline.md` - the mandatory development pipeline (Phases 0–8.5, R1–R4, cross-cutting rules). Separated from CLAUDE.md because it is long and specialised.
- `context-review.md` - the Phase 8.5 compliance checklist (C1–C12). Contains specific, verifiable checks executed at the end of every block. Separated from pipeline.md to keep the checklist independently updatable.

**When to update**: only when the workflow itself changes - a phase is added, a rule is refined,
or a process error reveals a gap. Not routine.

---

## CLAUDE.local.md - Personal/temporary overrides

**Official Anthropic feature**: yes - auto-loaded at session start. Gitignored in this project
(explicitly added to `.gitignore`). Official Anthropic default path is `CLAUDE.local.md` at
project root; this project uses `.claude/CLAUDE.local.md` (both paths are supported).

**What it is**: a personal override file for instructions that should NOT be shared with the team.
Useful for: temporary suspensions (e.g. "skip Phase 4 and 5 during requirements revision"),
personal preferences, machine-specific instructions.

**Current content in this project**: temporary instructions active for the current work phase
(e.g. phase suspensions, personal preferences). Read `.claude/CLAUDE.local.md` to see
what is currently active. Remove or update when the temporary phase ends.

**What belongs here**:
- Temporary instructions active only during a specific phase of work
- Personal preferences that differ from team defaults
- Machine-specific settings (e.g. a different local port)

**What does NOT belong here**: permanent rules (put those in `pipeline.md` or `CLAUDE.md`).

---

## MEMORY.md - Session memory

**Two distinct MEMORY files coexist in this project - do not confuse them**:

| File | Path | Committed? | Loaded by | Purpose |
|---|---|---|---|---|
| Auto-memory | `~/.claude/projects/.../memory/MEMORY.md` | ❌ no | Claude Code system (injected in context) | Claude's private persistent patterns - never add to git |

**This project's MEMORY.md** (at the repo root) is a **project convention**:
- It is **NOT auto-loaded** by Claude Code
- Claude reads it explicitly in **Phase 0** of the pipeline ("Check MEMORY.md")
- It is committed and shared with the team (it tracks project-level learnings, not personal state)
- Must never contain sensitive data (tokens, credentials) - those belong in `.env.local` only

**Why it exists**: bridges sessions. After a context reset, Claude re-reads MEMORY.md in
Phase 0 to re-align without you re-explaining the situation.

**Two sections**:

| Section | What goes in it | When updated |
|---|---|---|
| **Active plan** | Current step, status, next action, open questions | Phase 8 (close step) or mid-block |
| **Lessons/Patterns** | Concrete findings from past blocks - bugs discovered, pitfalls, workarounds | Phase 8 (only if new, not already in CLAUDE.md) |

**Rules**:
- Keep under ~150 active lines. Beyond that: extract a topic into a separate file and link it.
- No duplication with CLAUDE.md. If a lesson becomes a stable project truth → move it to CLAUDE.md.
- Lessons must be specific: observation + root cause + fix. Not generic advice.

---

## .claude/settings.json and .claude/settings.local.json

**Official Anthropic feature**: yes - both auto-loaded at session start.

**What they configure**: tool permissions (which commands run without a prompt), environment
variables, model selection, sandbox mode, and more.

| File | Scope | Committed? | Purpose |
|---|---|---|---|
| `.claude/settings.local.json` | Project, personal only | No (gitignored) | Personal permission overrides |
| `~/.claude/settings.json` | All projects on this machine | No | Personal global preferences |

**Precedence** (highest to lowest): managed (org-wide) → command-line → local → project → user.

**This project's `.claude/settings.json`** (committed): all Bash commands + MCP tools pre-authorised,
so Claude does not ask for permission at every pipeline command (build tools, test runners, git, scripts).
No `settings.local.json` is currently active - personal overrides are in `~/.claude/settings.json` (Bash(*) global).

Key settings configured:
- `attribution.commit/pr: ""` - suppresses automatic Co-Authored-By (pipeline adds it manually in commit heredoc)
- `includeGitInstructions: false` - removes redundant built-in git instructions from system prompt (pipeline.md covers this); replaces the old `env.CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS` env var approach
- `hooks.SessionStart` - checks `.claude/session/last-arch-audit` timestamp in the project directory; if >7 days since last `/arch-audit` **and at least one block has completed** (a dated row in `docs/implementation-checklist.md`), prints a reminder at session open. The completed-block gate means a brand-new project is never nagged about an audit it cannot need yet. Also emits a **stale-block reminder** (tier M/L): if the active `.claude/session/block-*.md` has been open ≥5 days, it surfaces a scope-creep prompt (close the block in Phase 8 or split the work)
- `hooks.InstructionsLoaded` - appends raw hook payload (JSON) to `/tmp/claude-instructions-YYYYMMDD.log` (async, non-blocking); inspect this file to debug which CLAUDE.md or rules files were loaded and when

---

## Pipeline-integrated skills (Tier M/L)

Two pipeline-integrated skills run in forked context during specific pipeline phases and return structured results to the main session:

- **`/dependency-scan`** (Tier M/L) - Phase 1: runs 6 dependency checks (route consumers, imports, types, tests, FKs, access control) and returns a structured report with mandatory file additions.
- **`/context-review`** (Tier L only) - Phase 8.5: runs C1-C3 grep checks (credential patterns, unresolved placeholders, field name staleness) and returns pass/fail per check.

---

## .claude/commands/ - Custom commands (Tier M/L)

Reusable prompt templates invoked with `/command-name`. See `.claude/commands/README.md` for usage and examples.

---

## Quick reference - "Where does this information go?"

| Information type | File |
|---|---|
| Tech stack, RBAC, state machines, known patterns | `CLAUDE.md` |
| Development pipeline, phase gates, cross-cutting rules | `.claude/rules/pipeline.md` |
| Phase 8.5 compliance checklist (C1–C12) | `.claude/rules/context-review.md` |
| Temporary suspension or personal override | `CLAUDE.local.md` |
| Tool permission settings | `.claude/settings.local.json` (personal, gitignored) |
| Current work in progress, session state | `MEMORY.md` → Active plan |
| Bug or pattern discovered during implementation | `MEMORY.md` → Lessons/Patterns |
| DB migration applied | `docs/migrations-log.md` |
| Product specification | `docs/requirements.md` |
| Block progress and test results | `docs/implementation-checklist.md` |
| Tech debt and deferred improvements | `docs/refactoring-backlog.md` |
| Product context, feature scope, stakeholder requirements | `docs/prd/prd.md` |
| Domain entity: field × permission × validation matrix | `docs/contracts/<entity>-fields.md` |

---

## Quick reference - "When does Claude read this?"

| File | When | How |
|---|---|---|
| `CLAUDE.md` | Every session | Automatic |
| `CLAUDE.local.md` | Every session | Automatic (gitignored) |
| `.claude/rules/pipeline.md` | Every session | Automatic (rules dir) |
| `.claude/rules/context-review.md` | Every session | Automatic (rules dir) |
| `.claude/settings.json` | Every session | Automatic (project settings) |
| `.claude/settings.local.json` | Every session | Automatic (gitignored, if present) |
| `MEMORY.md` (project root) | Phase 0 | Explicit read in pipeline |
| Auto-memory `MEMORY.md` | Every session | Claude Code system injection |
| `docs/requirements.md` | Phase 1 | Explicit read in pipeline |
| `docs/implementation-checklist.md` | Phase 1 | Explicit read in pipeline |
| `docs/refactoring-backlog.md` | Phase 1 | Explicit read in pipeline |
| `docs/prd/prd.md` | Phase 1 (new feature areas) + Phase 8 step 2f (update, mandatory) | Explicit read/write in pipeline |
| `docs/contracts/<entity>-fields.md` | Phase 1 (domain blocks) | Explicit read in pipeline |
| `docs/migrations-log.md` | Phase 2 | Explicit write after migration |
| `subdir/CLAUDE.md` | When reading files in that subdir | On-demand by Claude Code |
