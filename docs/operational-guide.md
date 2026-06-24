# tierward - Operational Guide

**Version**: 1.33.1
**Audience**: Builder PMs, tech leads, and senior developers using Claude Code - from first exploration to structured, reviewable delivery
**Format**: Reference + step-by-step. Read section 1 and your target tier section first, then use the rest as a lookup.

<!-- MAINTAINER NOTE (arch-audit P5, 2026-06-10): this guide is ~1490 lines, ~2.5x the ~600-line soft threshold. Navigation is mitigated by the 16-entry Table of Contents below. A progressive-disclosure split (extract sections into linked files, re-anchor the ToC, update README cross-refs) is a tracked future task; weigh it before adding large new sections here. -->

---

## Table of Contents

1. [What this is and why it exists](#1-what-this-is-and-why-it-exists)
2. [Who is this for](#2-who-is-this-for)
3. [Prerequisites](#3-prerequisites)
4. [Installing the scaffold - three paths](#4-installing-the-scaffold---three-paths)
5. [Context Import - how Claude learns your project](#5-context-import---how-claude-learns-your-project)
6. [The four pipeline tiers](#6-the-four-pipeline-tiers)
7. [Incremental adoption](#7-incremental-adoption)
8. [Day-to-day workflow](#8-day-to-day-workflow)
9. [Governance files reference](#9-governance-files-reference)
10. [Audit skills](#10-audit-skills)
11. [Pipeline-integrated skills](#11-pipeline-integrated-skills-tier-ml)
12. [Custom skills](#12-custom-skills)
13. [Governance mechanics](#13-governance-mechanics)
14. [Conventions and non-negotiables](#14-conventions-and-non-negotiables)
15. [Maintaining the scaffold](#15-maintaining-the-scaffold)
    15b. [Anthropic drift tracking](#15b-anthropic-drift-tracking)
    15c. [Template coverage tests (maintainer-only)](#15c-template-coverage-tests-maintainer-only)
    15d. [Cross-LLM rubric for Context Builder (maintainer-only)](#15d-cross-llm-rubric-for-context-builder-maintainer-only)
16. [Frequently asked questions](#16-frequently-asked-questions)

---

## 1. What this is and why it exists

Claude Code is a powerful CLI assistant that can read, write, and reason about your entire codebase. Without shared process, it makes autonomous decisions that are hard to track and harder to review.

`tierward` scaffolds a structured, reviewable development process on top of Claude Code. It does not limit what Claude can do - it makes every meaningful action visible, auditable, and reversible.

**What you get:**

- A wizard that routes you to the right tier based on team experience and project complexity
- A development pipeline Claude follows strictly - requirements reviewed before code is written, tests verified before declaring done
- Pre-wired hooks that enforce the pipeline mechanically, not just as instructions
- A tiered system matching process overhead to task complexity: a two-line bugfix does not go through the same process as a multi-week feature
- 26 audit skills - executable multi-step programs with model routing (haiku for mechanical checks, sonnet for analysis)
- Audit trails, commit attribution, secret scanning, and CODEOWNERS gates for full visibility over AI-generated changes
- A discovery mechanism that teaches Claude about your existing codebase in a single structured session

**What it does not do:**

- It does not write your code - Claude Code does that. This tool governs how.
- It does not enforce specific tech stack choices. Everything is configurable.
- It does not slow you down for trivial changes. The Fast Lane (Tier S) has no gates.
- It does not require governance knowledge upfront. Tier 0 gets you running in 5 minutes.

---

## 2. Who is this for

### Audience A: Builder PM or tech lead exploring Claude Code

You want to build end-to-end with Claude Code - or evaluate it for your team. You may be a Product Manager with enough technical background to work in a terminal, a tech lead assessing the tool for your team, or a solo developer wanting a process before shipping anything real.

You don't need a full pipeline yet. You need to get started, understand what Claude Code can do, and have a process you can review.

**Your path**: Tier 0 - Discovery.

What you get: three files, one hard constraint (tests must pass before Claude declares done), and a `GETTING_STARTED.md` that walks you through the first session. Nothing else.

When you're ready for more structure - usually after a few sessions, once Claude Code is part of the daily workflow:

```bash
npx tierward upgrade --tier=s
```

This adds the Fast Lane pipeline non-destructively. Your existing files are not overwritten.

**You do not need to understand the full tier model to start.** Read `GETTING_STARTED.md` and sections 4 and 6 (Tier 0) of this guide.

---

### Audience B: Team already shipping with Claude Code

You're using Claude Code but the process is ad-hoc. Claude makes autonomous decisions you can't always trace. Tests sometimes get skipped. You want a structured, reviewable workflow without building one from scratch.

**Your path**: Tier S, M, or L depending on project complexity.

| Signal                                                        | Suggested tier     |
| ------------------------------------------------------------- | ------------------ |
| Low blast radius, single dev, reversible in minutes           | Tier S - Fast Lane |
| Single feature, moderate impact, 1-2 collaborators            | Tier M - Standard  |
| High blast radius, team of 3+, complex domain, shared systems | Tier L - Full      |

Read sections 4, 5, 6 (your tier), 7, and 8 of this guide.

---

### Audience C: Adopting incrementally

You don't want a full scaffold yet - just one skill or rule to try on your existing project.

**Your path**: `add skill` or `add rule` commands. See [section 7](#7-incremental-adoption).

---

## 3. Prerequisites

| Requirement | Version | Why                                                                   |
| ----------- | ------- | --------------------------------------------------------------------- |
| Node.js     | >= 22   | CLI runtime                                                           |
| Claude Code | latest  | The AI assistant being governed                                       |
| Git         | any     | Branch discipline enforced by pipeline                                |
| `gh` CLI    | any     | Optional - needed only for cloning private repos in From context mode |
| Pre-commit  | any     | Optional - needed only if you enable the pre-commit hook              |

Install Claude Code:

```bash
npm install -g @anthropic-ai/claude-code
```

---

## 4. Installing the scaffold - three paths

Run this from any directory:

```bash
npx tierward init
```

The wizard asks about your project state first:

```
? What's the state of this project?
  > Existing project - add Tierward to a project that already has code
    New project - starting from scratch, you'll fill in the details
    From existing docs - share your docs and Claude populates everything
```

Three init paths are available. All support `--dry-run` (preview without writing) and `--answers file.json` (skip prompts for CI/automation).

#### Optional: `context` sub-command (v1.23.0+)

Run `context` before `init` to make the scaffold reproducible and reviewable:

```bash
npx tierward context                       # produces CONTEXT.md
npx tierward init                          # reads CONTEXT.md, scaffolds with no further prompts
npx tierward context --all                 # one-shot: context then init
npx tierward context --from-yaml file.md   # bypass: validate + copy an existing CONTEXT.md (v1.26.0+)
npx tierward validate-context              # CI gate: exits 0 on pass, 1 on fail (v1.25.0+)
```

When `CONTEXT.md` is present in the cwd, `init` reads it and scaffolds without asking anything else. Pass `--ignore-context` to fall back to the prompt-based flow.

`CONTEXT.md` is a schema-validated project context file: Zod schema, 16 MUST PASS structural checks, plus eight inter-field constraints (tier-0 forces scaffold options off, mode invariants, dotted-path keys, `design_system_name` required when `has_design_system=true`, features block forbidden on tier 0/S, and so on).

Greenfield gets a PM-friendly interview. Existing repos go through three-phase inference: algorithmic detection wrapping `detect-stack`, optional LLM extraction, hybrid PM review. The first question routes you to a PM or developer flow. As of v1.24.0, the developer flow reuses the legacy `init` wizard's technical questions and auto-derives `tier.rationale` from `teamSize` + `workScope`, so devs skip the prose prompts.

As of v1.27.0, the schema covers all four pipeline tiers. Tier M and L pick up the feature-flag block: `has_api`, `has_database`, `has_frontend`, `has_design_system` (plus `design_system_name`), `has_prd`, plus `audit_model` and the optional `commands.build` / `commands.e2e` fields.

---

### 4a. Greenfield - new project from scratch

**Use when**: you are starting a new project and there is no existing codebase.

The wizard asks first: **"How familiar is your team with Claude Code?"**

- **Just starting out** -> Tier 0 (Discovery). The remaining questions are simplified.
- **We use it and want guardrails** -> continues to the experienced path below.

For experienced users, the wizard asks:

- Project name and one-line description
- **3 diagnostic questions -> auto-suggest tier**:
  1. "How many engineers will use Claude Code on this project?" (solo / small team / larger team)
  2. "What kind of work will you primarily do?" (bugfixes / feature blocks / complex/long-running)
  3. The wizard suggests a tier with a description (phases, gates, overhead) - you confirm or pick a different one
- Tech stack (Node.js/TS, Node.js/JS, Python, Go, Swift, Kotlin, Rust, .NET, Ruby, Java, other)
- Test command, type check command, dev server command
- **E2E test command (Playwright/Cypress - optional, Tier M/L only)**: leave blank to skip. When configured, Phase 4 becomes available and activates per block when the scope gate confirms UI flows are in scope
- **Feature flags (Tier M/L only)** - questions that determine which audit skills are installed:
  - "Does your project expose an API?" -> installs `/api-design`
  - "Does your project use a database?" -> installs `/skill-db`
  - "Does your project have a frontend / UI?" -> installs `/responsive-audit`, `/visual-audit`, `/ux-audit`
  - "Do you use a component library or design system?" -> installs `/ui-audit`
  - "Design system name?" -> populates `[DESIGN_SYSTEM_NAME]` placeholder
  - "Track a PRD per feature block?" -> determines if `docs/prd/prd.md` is referenced in context review
  - "Preferred Claude model for deep-analysis skills (visual-audit, ux-audit)?" -> free-text input, default `claude-sonnet-4-6` (override with any current model id)
- Whether to include pre-commit config and `.github/` files

Output: a fully scaffolded project directory with `CLAUDE.md`, pipeline rules, settings, and docs - ready to open in Claude Code.

**After running:**

1. Read `.claude/FIRST_SESSION.md` (Tier M/L) - your team's guide to the first block cycle. Auto-deleted after first block closure.
2. Review `CLAUDE.md` - fill in the project-specific details.
3. Open Claude Code: `claude` from the project root.

---

### 4b. From context - populate from existing repos and docs

**Use when**: you are starting a new governance project but want to bootstrap it from an existing codebase or documentation.

The wizard asks for:

- One or more source repositories (GitHub URL, `org/repo`, or local path)
- Optional source documents (PDF, Markdown, TXT file paths)
- New project name
- Which repo is the primary (if multiple)
- Pipeline tier, pre-commit, `.github/`

What happens:

1. Each source repo is cloned into `.claude/context/repos/<name>/` using `gh` CLI (private repos) or `git clone --depth=1` (public).
2. Source documents are copied to `.claude/context/docs/`.
3. The governance scaffold is created.
4. `CONTEXT_IMPORT.md` is generated in the project root with paths and a structured workflow.
5. `.claude/context/` and `CONTEXT_IMPORT.md` are added to `.gitignore`.

**After running:** open Claude Code. Claude detects `CONTEXT_IMPORT.md` and runs the Discovery Workflow automatically. See section 5.

---

### 4c. In-place - add governance to an existing project

**Use when**: you already have a project at the current directory and you want to add the governance layer without starting fresh.

The CLI:

1. Auto-detects your tech stack by inspecting `package.json`, `tsconfig.json`, `requirements.txt`, `go.mod`, `Cargo.toml`, `Package.swift`, `Gemfile`, `pom.xml`, `build.gradle`, `*.csproj`, and Xcode project directories. Supported stacks: Node.js/TS, Node.js/JS, Python, Go, Swift, Kotlin, Rust, .NET, Ruby, Java.
2. Shows detected values pre-filled in every prompt - you confirm or override.
3. Counts your source files to suggest an appropriate tier.
4. Creates all governance files **without overwriting** `CLAUDE.md`, `MEMORY.md`, `.gitignore`, or `README.md` if they already exist.
5. Generates `CONTEXT_IMPORT.md` pointing to the current directory.
6. Appends tierward entries to `.gitignore`.
7. Optionally runs `doctor` inline to validate the scaffold.
8. Optionally installs pre-commit hooks inline.

**After running:** open Claude Code with `claude`. Claude detects `CONTEXT_IMPORT.md` and runs the Discovery pass automatically - reads your codebase, generates `CLAUDE.md` content, and asks about anything it could not infer from the code. See section 5.

---

## 5. Context Import - how Claude learns your project

`CONTEXT_IMPORT.md` is a bridge file generated by the CLI. It contains:

- **Import mode** - `from-context` or `in-place`
- **Source repositories** - paths to cloned repos under `.claude/context/repos/`
- **Source documents** - paths to copied docs under `.claude/context/docs/`
- **Primary repository** - the main codebase for context priority

On every Claude Code session, Claude reads this file first. If the status is `PENDING_DISCOVERY`, it runs the following workflow **before any other work**:

### Discovery Workflow (6 steps)

**Step 1 - Read source repositories**: For each listed repo, Claude reads root files, folder structure (1-2 levels), and extracts: tech stack, framework, key commands, folder conventions, naming conventions, roles/RBAC, state machines, known patterns, test setup.

**Step 2 - Read source documents**: Extracts product requirements, business rules, user roles, workflows, data model hints, and potential ADRs.

**Step 3 - Populate project files**: Using the extracted information, Claude populates `CLAUDE.md`, `.claude/rules/pipeline.md` (replaces placeholders), `.claude/settings.json` (resolves Stop hook command), `docs/requirements.md` (Tier M/L), `docs/implementation-checklist.md` (Tier M/L), and `docs/adr/` files.

**Step 4 - Present discovery summary**: Structured output covering project, stack, framework, key commands, roles, state machines, ADRs, populated files, and gaps.

**Step 5 - Ask targeted gap questions**: Claude asks about anything it could not infer: auth mechanism, deployment target, team size, permission model details.

**Step 6 - Mark discovery complete**: After you confirm the summary and answer gap questions, Claude updates `CONTEXT_IMPORT.md` status from `PENDING_DISCOVERY` to `COMPLETE`.

> **To trigger re-discovery** (e.g. after a major architecture change): delete the line `Status: COMPLETE` from `CONTEXT_IMPORT.md`. The next session will re-run the workflow.

---

## 6. The four pipeline tiers

The pipeline is the sequence of phases Claude follows for every development task. You choose the tier when running `init`. Change it later with: `npx tierward upgrade --tier=m`.

### Tier 0 - Discovery

**Use for**: teams exploring Claude Code for the first time. No pipeline knowledge required.
**What it provides**: one constraint (tests must pass), project context (CLAUDE.md), and one communication rule (output-style.md). No pipeline, no workflow rules.

| File                            | Purpose                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| `CLAUDE.md`                     | Project context: stack, commands, conventions. Claude reads this every session.          |
| `.claude/settings.json`         | Stop hook: tests must pass before Claude declares a task complete.                       |
| `.claude/rules/output-style.md` | Communication rules: answer-first, no AI-tells, hold position on evidence not pressure.  |
| `GETTING_STARTED.md`            | Step-by-step guide for the first session.                                                |

**The Stop hook is the only enforcement control in Tier 0** - tests must pass before Claude can finish. The one rule file (output-style.md) shapes how Claude communicates, but it gates nothing.

**After running init (Tier 0):**

1. Edit `CLAUDE.md` - fill in the project description and verify the commands.
2. Read `GETTING_STARTED.md` for what to expect.
3. Run `claude` from the project root.

**Upgrading from Tier 0:**

```bash
npx tierward upgrade --tier=s   # adds branch discipline + commit rules
npx tierward upgrade --tier=m   # adds phased pipeline + review gates + docs
npx tierward upgrade --tier=l   # adds full governance + audit skills
```

Upgrade is non-destructive - it adds new files without overwriting your existing `CLAUDE.md` or `settings.json`.

---

### Tier S - Fast Lane

**Use for**: low blast radius tasks - single dev, reversible in minutes, no shared system impact. Bugfixes, isolated changes, hotfixes.
**Branch prefix**: `fix/description` - Claude detects this and switches to Fast Lane automatically.
**Scaffolded files**: minimal set - no informational docs (files-guide, adr-template, pipeline-standards, claudemd-standards are excluded for Tier S).

| Phase | Action                                                                                                                                                                                             |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FL-0  | Check `.claude/session/` for interrupted fix. Create session file. Confirm `fix/*` branch. **Escalation check**: if the fix touches a shared utility with >5 import consumers, escalate to Tier M. |
| FL-1  | **Compact scope confirm** (one list of files + changes, wait for execution keyword). Implement. Run type check + tests. Commit.                                                                    |
| FL-2  | Merge to staging. Wait for deploy. Verify in 1-3 steps.                                                                                                                                            |
| FL-3  | Merge to main. Verify production deploy. One-line summary: `fix complete - description . type check . tests N/N`                                                                                   |
| FL-4  | Update checklist if fix closes a tracked item. Delete session file (only after fix confirmed in production).                                                                                       |

**One lightweight gate** in FL-1 (compact scope confirm). Claude proceeds autonomously after execution keyword.

**Escalation** - Claude automatically escalates to Tier M if: scope expands beyond 3 files, a migration is required, or a shared utility with >5 consumers is touched.

---

### Tier M - Standard

**Use for**: feature blocks, 1-2 week changes, <=15 files, no complex domain changes.
**Branch prefix**: `feature/block-name`.

| Phase | Action                                                                                                                                                | Gate |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 0     | Session orientation. CONTEXT_IMPORT.md check. Session file (create/resume). Read CLAUDE.local.md. Read MEMORY.md. Branch check.                       | -    |
| 1     | **Mode selection** (Spec-first A or Scope-confirm B) + scope sweep (Tier 1 or 2) + dependency scan (`/dependency-scan`) + spec doc if Mode A.         | STOP |
| 1.5   | Design review - data flow, trade-offs, discarded alternatives. _(skip for <=3 files, no migrations)_                                                  | STOP |
| 2     | Implementation. Security checklist (5 checks) before commit. `/simplify` on changed files.                                                            | -    |
| 3     | Type check + build + tests. Intermediate commit.                                                                                                      | -    |
| 3b    | API integration tests (auth 401, authz 403, validation 400, business rules, DB state). _(if routes were added/modified)_                              | -    |
| 4     | **UAT / E2E tests** (Playwright/Cypress). _(only if E2E command configured AND scope gate confirmed UI flows + user defined UAT scenarios)_           | -    |
| 5b    | Test data setup - insert representative records for all relevant states.                                                                              | -    |
| 5c    | Staging deploy + smoke test (both themes if UI changes).                                                                                              | -    |
| 5d    | **Block-scoped quality audit** - Track A (UI) and Track B (API/DB). Severity: Critical fix before Phase 6; Major flag in checklist; Minor to backlog. | -    |
| 6     | Outcome checklist with actual results.                                                                                                                | STOP |
| 8     | Block closure: session file delete (with ambiguity check), docs, 3-commit sequence (code/docs/context), promote to main.                              | -    |
| 8.5   | Context review C1-C12 (all run in main session). Mandatory closing message. `/compact`.                                                               | -    |

**After running init (Tier M):**

1. Read `.claude/FIRST_SESSION.md` - your team's guide to the first block cycle.
2. Fill in `CLAUDE.md` placeholders and `docs/requirements.md` with planned blocks.
3. Run `claude` from the project root. Claude orients itself in Phase 0 automatically.

**Two STOP gates** (Phases 1 and 6). Claude presents results at each and waits for an explicit execution keyword before proceeding.

**Phase 1 - mode selection + scope gate**:

Claude auto-selects the working mode based on block signals and declares it with a one-line rationale. You can override before the STOP gate.

- **Mode A - Spec-first** (auto-selected when any signal is present: Tier 2 sweep triggered, new feature with unclear shape, new API endpoint or contract change, multi-component work): Claude generates `docs/specs/[block-name].md` with goal, acceptance criteria (EARS format), in-scope file list from dependency scan, explicit out-of-scope, and definition of done. The STOP gate becomes a spec review. Completed specs are archived at block close.
- **Mode B - Scope-confirm** (auto-selected when all signals are absent: Tier 1 sweep, refactor, bug fix, isolated change with bounded scope): structured sweep, then proceed.

**Scope sweep** (both modes): Claude auto-selects Tier 1 or Tier 2:

- **Tier 1 - Standard Sweep** (<=5 files, single entity, no migration, no new pattern): 8 dimensions (roles, data, triggers, errors, UI states, integrations, reversibility, exclusions).
- **Tier 2 - Deep Sweep** (>5 files, new entity, migration, multi-role): Tier 1 + states, conditions, pre-mortem.
- Claude declares: "does this block include critical UI flows?" If yes and E2E is configured, you list the UAT scenarios (1-5 numbered user journeys). Claude tests exactly those - no invented scenarios.

---

### Tier L - Full

**Use for**: complex domain changes, long-running projects, teams of 3+, architectural decisions.
**Branch prefix**: `feature/block-name`.

> **Current status**: Tier L is in maintenance mode. It remains functional and tested, but no new features are being added to Tier L exclusively. New capabilities are developed for Tier M first and promoted to L when there is real adoption signal.

| Phase     | Action                                                                                                                                                  | Gate |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 0         | Session orientation. CONTEXT_IMPORT.md check. Session file (create/resume, rename in Phase 1). Read CLAUDE.local.md. Read MEMORY.md. Branch check.      | -    |
| 1         | **Mode selection** (Spec-first A or Scope-confirm B) + scope sweep (Tier 1 or 2 EARS) + full dependency scan (`/dependency-scan`) + spec doc if Mode A. | STOP |
| 1.5       | Design review - data flow, data structures, discarded alternatives. _(skip for <=3 files)_                                                              | STOP |
| 1.6       | Visual & UX design. ASCII wireframe + component map + UX rationale. _(UI blocks only)_                                                                  | STOP |
| Plan lock | EnterPlanMode -> user enables auto-accept -> ExitPlanMode -> `/compact`                                                                                 | -    |
| 2         | Implementation. Destructive migration rollback comments. Security checklist (5 checks). `/simplify`.                                                    | -    |
| 3         | Type check + build + unit tests. Intermediate commit.                                                                                                   | -    |
| 3b        | API integration tests (auth 401, authz 403, validation 400, business rules, DB state, cleanup).                                                         | -    |
| 4         | **UAT / E2E tests** _(only if E2E command configured AND scope gate confirmed UI flows + user defined UAT scenarios)_                                   | -    |
| 5b        | Test data setup - cleanup-first, all relevant states.                                                                                                   | -    |
| 5c        | Staging deploy + smoke test (all roles, both themes if UI).                                                                                             | -    |
| 5d        | **Block-scoped quality audit** - Track A (UI) and Track B (API/DB) with full skill suite.                                                               | -    |
| 6         | Outcome checklist: build/test + design system compliance + features + audit results.                                                                    | STOP |
| 8         | Block closure: session file (ambiguity check), docs, ADR, 3-commit sequence (code/docs/context), main.                                                  | -    |
| 8.5       | C1-C3 via `/context-review`. C4-C12 in main session. **Mandatory closing message**. `/compact`.                                                         | -    |

**Four STOP gates** (Phases 1, 1.5, 1.6, 6). Plan-lock before Phase 2 locks the full approved plan before code is written.

**Structural Requirements Changes (R1-R4)** - separate pipeline activated when stakeholders change functional scope on already-implemented blocks:

- **R1**: update requirements section by section, STOP for approval
- **R2**: impact analysis - which blocks, which files, which tests
- **R3**: update checklist + backlog, STOP before touching code
- **R4**: execute block by block via standard pipeline

---

### Choosing the right tier

When in doubt:

- **Never used Claude Code before** -> Tier 0 (Discovery)
- **Fix a bug** or make a small change you can describe in one sentence -> Tier S
- **Build a feature** you can scope in 1-2 weeks -> Tier M
- **Redesign a domain**, make architectural decisions, add a major new entity, or work with a team of 3+ -> Tier L

You can start at Tier 0 or S and escalate. Claude notifies you when scope expands beyond the current tier.

---

## 7. Incremental adoption

You don't need a full scaffold to start using Tierward components. Install individual skills or rules into any project that already has a `.claude/` directory.

### Adding a single skill

```bash
npx tierward add skill security-audit
npx tierward add skill perf-audit
npx tierward add skill commit
```

This copies the SKILL.md file into `.claude/skills/<name>/` and appends it to the `## Active Skills` section in CLAUDE.md (if that section exists). No other files are modified.

Available skills (26): `arch-audit`, `security-audit`, `perf-audit`, `skill-dev`, `skill-review`, `simplify`, `commit`, `skill-security`, `systematic-debugging`, `api-design`, `skill-db`, `migration-audit`, `visual-audit`, `ux-audit`, `responsive-audit`, `ui-audit`, `accessibility-audit`, `test-audit`, `dependency-audit`, `dependency-scan`, `pr-review`, `doc-audit`, `api-contract-audit`, `compliance-audit`, `infra-audit`, `context-review`.

Options:

- `--force` - overwrite if the skill already exists
- `--dry-run` - show what would be created without writing files

### Adding a single rule

```bash
npx tierward add rule git
npx tierward add rule output-style
npx tierward add rule security
npx tierward add rule security --stack swift
```

Available rules: `git`, `output-style`, `security`.

The security rule supports stack-specific variants via `--stack`:

| Stack flag                     | Security variant installed |
| ------------------------------ | -------------------------- |
| _(none)_                       | Web (default)              |
| `swift`                        | Native Apple               |
| `kotlin`                       | Native Android             |
| `rust`, `go`, `dotnet`, `java` | Systems                    |

Options: `--force`, `--dry-run` (same as `add skill`).

### 7c. Creating custom skills

```bash
npx tierward new skill
```

Interactive wizard that generates a complete custom skill:

1. **SKILL.md** with valid frontmatter (name, description, model, context, effort, allowed-tools) and a step-by-step body template
2. **test-skill.js** alongside SKILL.md - validates frontmatter structure, description length, and allowed-tools compliance
3. **CLAUDE.md registration** - adds the skill to the Active Skills section automatically

The generated skill uses the `custom-` naming convention, which protects it from being overwritten during `upgrade` or `init` operations.

Options:

- `--name <name>` - skip the name prompt (auto-prepends `custom-` if missing)
- `--dry-run` - preview what would be created
- `--answers <json>` - bypass all prompts with JSON (for automation)

### Minimum viable Tierward

The smallest useful Tierward setup - no full scaffold required:

```bash
mkdir -p .claude/skills .claude/rules
npx tierward add rule git
npx tierward add skill commit
npx tierward add skill security-audit
```

This gives you: conventional commits, security auditing, and git discipline - without a pipeline, session files, or STOP gates. Add more components as needed.

---

## 8. Day-to-day workflow

### Starting a new feature (Tier M example)

```bash
# 1. Create a branch
git checkout staging && git pull
git checkout -b feature/user-notifications

# 2. Open Claude Code
claude

# 3. Describe the task
# Claude starts at Phase 0 (session orientation)
# -> creates .claude/session/block-user-notifications.md
# -> confirms branch is feature/*
# -> reads MEMORY.md

# 4. Claude presents Phase 1 requirements summary and file list
# Review it. If correct: "confirmed, proceed"
# If wrong: correct it. Claude updates the plan.

# 5. Claude implements (Phase 2)
# With auto-accept edits enabled: files are written without per-file prompts

# 6. Claude runs tests (Phase 3)
# If anything fails: Claude fixes and re-runs

# 7. Claude merges to staging and smoke tests (Phase 5)

# 8. Claude presents the outcome checklist (Phase 6)
# Review it. If everything is correct: "confirmed, proceed"

# 9. Claude closes the block (Phase 8)
# -> deletes session file
# -> updates implementation-checklist.md
# -> commits docs
# -> merges to main
```

### Starting a quick fix (Tier S)

```bash
git checkout -b fix/login-redirect-loop
claude

# Describe the fix. Claude proceeds through FL-0 -> FL-4 autonomously.
# No STOP gates. Done in minutes.
```

### Starting a session after an interruption

Claude's first action in every session is to check `.claude/session/` for existing `block-*.md` files. If one exists, it resumes from the recorded state automatically. No manual re-orientation needed.

### Enabling auto-accept edits

For Tier M/L blocks, after Phase 1 approval, enable **auto-accept edits** in Claude Code before Phase 2 starts. This prevents the per-file approval dialog from blocking a multi-file implementation.

In Claude Code: press `Shift+Tab` to toggle between default, auto-accept, and plan-only modes.

---

## 9. Governance files reference

### .claude/FIRST_SESSION.md (Tier M/L - auto-deleted after first block)

Scaffolded by the CLI for Tier M and Tier L. A practical guide to the first block cycle: what was created, how to fill in CLAUDE.md, how to start the first session, and what each pipeline phase does. Auto-deleted in Phase 8 after the first block closure.

---

### CLAUDE.md

The primary project context file. Claude reads it at the start of every session.

**Auto-populated fields** (filled by the scaffold from wizard/detection data):

- **Project name** - from wizard input
- **Tech Stack Summary** - from detected stack (e.g. "Node.js + TypeScript", "Swift / macOS")
- **Framework** - auto-detected from dependencies. Shows "N/A - native app" for Swift/Kotlin/Rust/.NET/Java.
- **Language** - derived from tech stack
- **Key Commands** - from wizard input or native defaults (e.g. `xcodebuild test` for Swift)

**What to fill in manually:**

- Project overview (2-4 sentences)
- Database, Auth, Storage, Email, Deploy fields
- Folder conventions and naming conventions
- Known non-obvious patterns (things Claude would get wrong without being told)
- RBAC / permission model if applicable

**Size discipline**: keep it under 200 lines. Beyond that: extract stable patterns into `.claude/rules/` files.

---

### MEMORY.md (Tier M/L)

Shared lessons and active project state. Updated at the end of every block.

**Sections:**

- **Active plan** - block-by-block status table. Updated every block.
- **Key technical patterns** - non-obvious decisions worth preserving across sessions.
- **Lessons** - things that went wrong and how to avoid them.

**Size discipline**: keep under 150 lines.

---

### .claude/settings.json

Permissions and hooks. Five hooks are pre-configured in Tier M/L (three in Tier S):

| Hook                      | Event                | Tier  | What it does                                                                            |
| ------------------------- | -------------------- | ----- | --------------------------------------------------------------------------------------- |
| Test gate                 | `Stop`               | S M L | Runs test command. If tests fail, Claude is blocked and must fix before declaring done. |
| Audit log                 | `PostToolUse`        | M L   | Appends every Write/Edit/Bash call to `~/.claude/audit/[project].jsonl`.                |
| Session log               | `SessionStart`       | S M L | Logs session start to `~/.claude/audit/sessions.log`.                                   |
| Arch-audit reminder       | `SessionStart`       | S M L | If `/arch-audit` hasn't run in 7 days, prints a reminder at session open.               |
| Instructions debug log    | `InstructionsLoaded` | M L   | Appends loaded context payload to `/tmp/claude-instructions-YYYYMMDD.log`.              |
| CLAUDE.local.md reminder  | `PostCompact`        | M L   | Reminds Claude to re-read `.claude/CLAUDE.local.md` after `/compact`.                   |
| Destructive command block | `PreToolUse`         | L     | Blocks `rm -rf /`, `DROP DATABASE`, and similar patterns.                               |
| LLM security review       | `Stop`               | L     | Haiku checks for hardcoded secrets and missing auth at session close.                   |

**Stack-aware permissions**: `permissions.allow` is set to stack-appropriate CLI tools at scaffold time. `permissions.deny` includes base protections (force push, `rm -rf /`, `DROP TABLE`, `TRUNCATE`) plus stack-specific release/publish commands:

| Stack             | Allow                               | Deny (additions)                              |
| ----------------- | ----------------------------------- | --------------------------------------------- |
| Node.js (default) | git, node, npm, npx, curl           | -                                             |
| Swift             | git, swift, xcodebuild, xcrun, curl | xcodebuild archive, xcrun altool --upload-app |
| Kotlin            | git, gradlew, gradle, curl          | gradlew publish                               |
| Rust              | git, cargo, rustc, curl             | cargo publish                                 |
| .NET              | git, dotnet, curl                   | dotnet nuget push                             |
| Java              | git, mvn, gradlew, gradle, curl     | mvn deploy, gradlew publish                   |
| Ruby              | git, bundle, rails, rake, curl      | gem push                                      |
| Python            | git, python, pip, uv, curl          | twine upload                                  |
| Go                | git, go, curl                       | -                                             |

> **Git-deploy hosts (Cloudflare Pages, Vercel, Netlify, Render):** these platforms deploy by watching pushes to `main`. The default deny `Bash(git push origin main*)` is intentional — it prevents accidental direct pushes. The correct flow is `feature/*` → PR → merge to `main`; the host picks up the merge commit automatically. Do **not** relax the deny to work around it.

---

### .claude/rules/pipeline.md

The development workflow Claude follows. Tier-appropriate content is scaffolded at init time.

You can add project-specific overrides at the bottom of this file:

```markdown
## Project-specific rules

- Always run `npm run db:migrate` before running tests.
- Do not touch `lib/legacy/` - it is scheduled for deletion.
```

---

### .claude/rules/security.md

Stack-aware security rules. The scaffold selects the appropriate variant based on your tech stack:

| Variant            | Stacks                                       | Focus areas                                                                                           |
| ------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Web** (default)  | Node.js, Python, Ruby, Go/Java/.NET with API | Auth checks, input validation, SQL injection, RLS/ACL, API response security, HTTP headers            |
| **Native Apple**   | Swift                                        | App Sandbox entitlements, Keychain access, TCC permissions, Data Protection, code signing             |
| **Native Android** | Kotlin                                       | Manifest permissions, Android Keystore, EncryptedSharedPreferences, network security config, ProGuard |
| **Systems**        | Rust, Go, .NET, Java (without API)           | Memory safety, process execution, file permissions, input validation at system boundaries             |

Selection logic: Swift always gets native-apple, Kotlin always gets native-android. Rust/Go/.NET/Java get the systems variant when `hasApi=false`, otherwise the web variant. All other stacks get the web variant. The output file is always named `security.md` regardless of variant.

You can also install a specific variant via `npx tierward add rule security --stack swift`.

---

### .claude/rules/git.md

Commit format, branch naming rules, PR conventions. Loaded for all git operations.

---

### .claude/rules/output-style.md (all tiers)

Communication rules for Claude in this project. No sycophantic openers, no AI discourse markers, plain vocabulary, directness-first, hyphen not em-dash.

---

### .claude/rules/context-review.md (Tier M/L)

End-of-block compliance checklist. Executed in Phase 8.5. Contains 12 checks (C1-C12), each with an explicit grep command, pass condition, and false-positive notes:

| Check | What it verifies                                            |
| ----- | ----------------------------------------------------------- |
| C1    | No credentials or tokens in auto-memory                     |
| C2    | No unresolved `[PLACEHOLDER_NAME]` patterns in active files |
| C3    | No stale field/config key names in CLAUDE.md                |
| C4    | No forward-looking references to closed blocks              |
| C5    | Every `MEMORY.md` mention in pipeline.md qualified          |
| C6    | No duplication between auto-memory and CLAUDE.md            |
| C7    | Both MEMORY files < 150 lines                               |
| C8    | All paths in files-guide.md exist on disk                   |
| C9    | Active plan in project-root MEMORY.md is current            |
| C10   | No dead file references in cross-doc paths                  |
| C11   | No completed items remain in refactoring-backlog.md         |
| C12   | Canonical docs current (sitemap, db-map, PRD)               |

**In Tier L**: C1-C3 are delegated to `/context-review` (grep-only, forked context). C4-C12 run in the main session.
**In Tier M**: all 12 checks run in the main session.

**Phase complete only when all 12 checks pass.** Then Claude posts the mandatory closing message and runs `/compact`.

---

### docs/adr/template.md (Tier M/L)

Architecture Decision Record template. The key addition vs. standard ADRs is the **AI Coding Guidance** section - durable constraints Claude follows when generating code in the affected area.

---

### .claude/session/ (gitignored)

Session recovery files. One file per active block, named `block-[name].md`. Created at Phase 0, deleted at Phase 8 after confirmed block closure. If the session is interrupted, the file persists and Claude resumes from it automatically.

---

### Interaction Protocol (CLAUDE.md)

Defined in the `CLAUDE.md` template for Tier M/L. Governs how Claude handles non-trivial requests:

1. Before any action that modifies files, config, or external systems, Claude states: scope, every intended action, and any irreversible operations.
2. Claude flags missing information and asks before acting.
3. Claude waits for an explicit execution keyword: `Execute`, `Proceed`, `Confirmed`, `Go ahead`.

**Exceptions** (always free, no keyword needed): read-only operations (`Read`, `Grep`, `Glob`, `git status/log/diff`) and active Phase 2 (once an execution keyword was given for the approved plan, Claude proceeds autonomously through implementation).

---

## 10. Audit skills

Twenty-six audit skills are scaffolded across the tiers (tier S installs 8, tier M installs 25, tier L installs all 26 with `context-review`). Run them as slash commands in Claude Code at any time - no pipeline phase required. Skills are **conditionally installed** based on wizard answers at init time.

All skill applicability rules are managed by a central skill registry (`packages/cli/src/scaffold/skill-registry.js`). Each skill declares which tiers and project conditions it requires.

### Tier availability and install conditions

| Command                 | S | M | L | Install condition                             | Requires                                                                     |
| ----------------------- | - | - | - | --------------------------------------------- | ---------------------------------------------------------------------------- |
| `/arch-audit`           | x | x | x | always                                        | Internet access (fetches Anthropic docs)                                     |
| `/commit`               | x | x | x | always                                        | -                                                                            |
| `/security-audit`       | x | x | x | always                                        | -                                                                            |
| `/perf-audit`           | x | x | x | always                                        | -                                                                            |
| `/skill-dev`            | x | x | x | always                                        | -                                                                            |
| `/simplify`             | x | x | x | always                                        | -                                                                            |
| `/skill-security`       | x | x | x | always                                        | -                                                                            |
| `/systematic-debugging` | x | x | x | always                                        | -                                                                            |
| `/api-design`           | - | x | x | `hasApi=true`                                 | -                                                                            |
| `/skill-db`             | - | x | x | `hasDatabase=true`                            | -                                                                            |
| `/migration-audit`      | - | x | x | `hasDatabase=true`                            | -                                                                            |
| `/responsive-audit`     | - | x | x | `hasFrontend=true`                            | Dev server + Playwright MCP                                                  |
| `/ux-audit`             | - | x | x | `hasFrontend=true`                            | Dev server + Playwright MCP                                                  |
| `/visual-audit`         | - | x | x | `hasFrontend=true`                            | Dev server + Playwright MCP                                                  |
| `/ui-audit`             | - | x | x | `hasFrontend=true` AND `hasDesignSystem=true` | - (static)                                                                   |
| `/accessibility-audit`  | - | x | x | `hasFrontend=true`                            | Dev server + Playwright MCP (for full/wcag modes; static mode needs nothing) |
| `/test-audit`           | - | x | x | always (no `requires`)                        | - (static analysis)                                                          |
| `/doc-audit`            | - | x | x | always (no `requires`)                        | - (static analysis)                                                          |
| `/api-contract-audit`   | - | x | x | `hasApi=true`                                 | - (static analysis; optional dev server for framework auto-gen)              |
| `/infra-audit`          | - | x | x | always (no `requires`)                        | - (static analysis)                                                          |
| `/compliance-audit`     | - | x | x | always (no `requires`)                        | - (static analysis)                                                          |
| `/skill-review`         | - | x | x | always                                        | - (static analysis)                                                          |
| `/dependency-audit`     | - | x | x | always (no `requires`)                        | - (optional `package-registry-mcp`; WebFetch fallback)                       |
| `/pr-review`            | - | x | x | always (no `requires`)                        | `gh` CLI                                                                     |
| `/dependency-scan`      | - | x | x | always (no `requires`)                        | - (static analysis; forked context)                                          |
| `/context-review`       | - | - | x | always (no `requires`)                        | - (grep-only; forked context)                                                |

### General rules

- Code-audit skills are **audit-only** - no code is modified (except `/simplify`, which applies changes directly). Findings go to `docs/refactoring-backlog.md` with severity-ranked IDs (`PERF-`, `API-`, `DB-`, `MIG-`, `DEV-`, `SEC-`, `UX-`, `A11Y-`, `TEST-`).
- Live-browser skills (`/responsive-audit`, `/ux-audit`, `/visual-audit`, `/accessibility-audit`) require the Playwright MCP server configured in `.claude/settings.json` and the dev server running. `/ui-audit` is static and does not require Playwright.
- Each skill runs in an isolated context fork (`context: fork`) - it does not pollute the main session window.
- Each skill delegates grep-heavy scanning to a Haiku Explore subagent to protect the main context window.
- Before first run: fill in the `## Configuration` placeholders at the top of each `SKILL.md`.
- Skills not installed at init can be added later: `npx tierward add skill <name>`.

### Block-scoped audit in Phase 5d (Tier M/L)

After the smoke test and before the outcome checklist, three tracks can run:

**Track A - UI** (if the block touches UI routes):
`/ui-audit` (static, concurrent with first Playwright skill) -> `/accessibility-audit` -> `/visual-audit` -> `/ux-audit` -> `/responsive-audit` (sequential, shared Playwright session).

**Track B - API/DB + compliance** (if the block touches API routes, applies migrations, or handles PII):
`/security-audit` and `/api-design` (concurrent, static); `/api-contract-audit` (if OpenAPI spec or API routes modified); `/migration-audit` (if the block applies migrations); `/skill-db` (if the block changes schema or adds new tables); `/compliance-audit` (if the block touches PII fields, user-data endpoints, consent flow, or third-party SDK integration).

**Track C - Test + doc + infra audit** (runs for every block after Phase 3 is green):
`/test-audit` - static analysis of coverage reports (lcov / Istanbul / Cobertura / go / tarpaulin / xcresult), pyramid shape (unit/integration/e2e ratio), and anti-patterns (`.only` leaks, skipped tests, empty bodies, no-assertion tests, hardcoded sleeps).
`/doc-audit` - static doc-drift check: relative-link resolution, code-block syntax (json/yaml/toml), Tierward placeholder residuals, slash-command name match, skill-count consistency, ADR freshness, and stack-specific doc sync (Next.js / Django / Swift).
`/infra-audit` - static infrastructure-security check across five layers (GitHub Actions, Dockerfile, K8s manifests, Terraform, GitLab CI); each layer runs only if its markers are detected. Critical findings from any of the three skills (`.only` committed, 0% coverage on a changed file, Tierward placeholder in README, pwn-request in workflow, secret logging in CI, privileged K8s container, IAM wildcard action, hardcoded secret in Terraform, no right-to-delete endpoint when PII is stored) block Phase 6.

### Severity handling

| Level    | Action                                                                 |
| -------- | ---------------------------------------------------------------------- |
| Critical | Fix before Phase 6. Claude does not proceed with open Critical issues. |
| Major    | Flag in Phase 6 checklist with planned resolution.                     |
| Minor    | Log in `docs/refactoring-backlog.md`.                                  |

### Playwright MCP prerequisite (for browser skills)

Add to `.claude/settings.json`:

```json
"mcpServers": {
  "playwright": {
    "command": "npx",
    "args": ["@playwright/mcp@latest"]
  }
}
```

### Skill details

#### /security-audit

**File**: `.claude/skills/security-audit/SKILL.md` | **Backlog prefix**: `SEC-n`

**3-path selector**: before starting, the skill reads CLAUDE.md and determines the execution mode:

- **WEB**: web or API project - full web audit (Steps 0-5) + Step 3e if non-JS stack
- **WEB+NATIVE**: native app with API routes - full web audit + Step 3e native checks
- **NATIVE-ONLY**: native app with no API routes - skips Steps 0-5, runs Step 3e (NS1-NS6 platform checks) + Step 6

Checks: auth/authorization on routes (A1-A5), response shape review (R1-R3), HTTP security headers, IDOR detection (A13), and native platform security (NS4-NS6 per stack).

#### /perf-audit

**File**: `.claude/skills/perf-audit/SKILL.md` | **Backlog prefix**: `PERF-n`

Checks: rendering boundary analysis (P1-P5: unnecessary `use client`, useEffect data loading, large client imports, unoptimized images, serial awaits), API query efficiency (Q1-Q3: N+1, unbounded lists, over-fetching), bundle size analysis, and stack-specific performance checks for all 8 stacks (Swift DispatchQueue patterns, Kotlin Room queries, Rust .clone() in hot paths, Go goroutine leaks, Python re.compile loops, Ruby N+1, Java autoboxing, .NET LINQ allocations). Resource footprint checks NR1-NR4 cover launch weight, memory management, energy patterns (mobile), and binary size.

#### /skill-dev

**File**: `.claude/skills/skill-dev/SKILL.md` | **Backlog prefix**: `DEV-n`

Checks: cross-feature coupling (D1), duplicated lookups (D2), dead exports (D3), magic literals (D4), pattern inconsistency (D5), oversized components (D6), suppressed type errors (D7), prop drilling (A1), premature abstractions (A2), missing abstractions (A3). Uses debt-density map for severity escalation.

#### /skill-db

**File**: `.claude/skills/skill-db/SKILL.md` | **Backlog prefix**: `DB-n`

Checks: schema quality (S1-S6: missing FK indexes, overly permissive access control, missing NOT NULL, wrong data types, missing ON DELETE, missing UNIQUE), N+1 query patterns (Q1-Q3). Migration file analysis is delegated to `/migration-audit`.

#### /migration-audit

**File**: `.claude/skills/migration-audit/SKILL.md` | **Backlog prefix**: `MIG-n`

Stack-aware static analysis of migration files - no live DB required. Detects stack automatically (Prisma, Drizzle, Supabase CLI, raw SQL; Rails/Django/Alembic/Flyway detected but pending support).

Checks: M1 lock-heavy DDL (CREATE INDEX without CONCURRENTLY, ADD COLUMN NOT NULL without DEFAULT, ALTER COLUMN TYPE rewrites), M2 non-reversible ops without rollback comment, M3 unsafe backfills without batching, M4 constraint sequencing for status/enum renames, M5 data loss risk (DROP on column still referenced), M6 unsafe type changes, M7 FK without indexed child column, M8 migration ordering integrity. Optional live DB cross-reference escalates destructive migrations already applied.

#### /api-design

**File**: `.claude/skills/api-design/SKILL.md` | **Backlog prefix**: `API-n`

Checks: URL naming and verbs (N1-N13: casing, semantic verbs, param placement, validation, error shape, auth exposure, field naming consistency, nesting depth), response shape consistency (R1-R3: envelope shape, status codes, pagination).

#### /arch-audit

**File**: `.claude/skills/arch-audit/SKILL.md` | **Tier**: S, M, L

Audits the governance layer itself - not your product code. Fetches Anthropic documentation and compares against your current `CLAUDE.md`, `settings.json`, `pipeline.md`. Classifies gaps as AUTO-FIX (deprecated settings, stale paths) or RECOMMEND (structural changes, new features). A SessionStart hook reminds you if it hasn't run in 7 days.

#### /visual-audit

**File**: `.claude/skills/visual-audit/SKILL.md` | **Tier**: M, L

10-dimension aesthetic evaluation: typographic hierarchy, spatial rhythm, visual focal point, colour discipline, information density, dark-mode polish, micro-polish, Gestalt compliance, typographic quality, interaction state design. Per-page scoring out of 50. Accessibility contrast is covered by `/accessibility-audit`.

#### /ux-audit

**File**: `.claude/skills/ux-audit/SKILL.md` | **Tier**: M, L

7-dimension UX evaluation (D1-D7): task completion, interaction consistency, feedback clarity, navigation clarity, cognitive load, error recovery, user confidence. Per-flow metrics: click count (target <=3), form fields (target <=6), redirects (target <=1).

#### /responsive-audit

**File**: `.claude/skills/responsive-audit/SKILL.md` | **Tier**: M, L

Static pre-checks (S1-S3: viewport-unit fonts, overflow hidden, non-responsive images), per-screenshot layout checks (R1-R6: horizontal overflow, table scroll, text cutoff, touch targets, grid collapse, modal overflow), visual responsiveness checks (VR1-VR6: hero reflow, card density, typography proportionality, CTA visibility, grid density, content hierarchy).

#### /ui-audit

**File**: `.claude/skills/ui-audit/SKILL.md` | **Tier**: M, L

Design token compliance, component adoption rate, empty state coverage. Static analysis only - no browser. Requires `hasDesignSystem=true`. Accessibility patterns are covered by `/accessibility-audit`.

#### /accessibility-audit

**File**: `.claude/skills/accessibility-audit/SKILL.md` | **Tier**: M, L

Unified accessibility surface. Three modes: `static` (A1-A8 grep-based patterns: aria-label on icon buttons, positive tabindex, outline-none regression, img alt, form labels, focus ring size, onClick on non-interactive, nav keyboard access); `full` (adds APCA contrast probes C1-C3 via Playwright); `wcag` (adds axe-core 4.9.1 scan with wcag2a/aa + wcag21aa + wcag22aa tags). Backlog prefix: `A11Y-`. Requires `hasFrontend=true`.

#### /test-audit

**File**: `.claude/skills/test-audit/SKILL.md` | **Tier**: M, L

Static test-suite quality audit. No live re-runs, no CI-history parsing - parses coverage reports already produced by the project's test runner. Stack-aware across all 11 supported stacks.

Checks:

- **Coverage (C1-C3)**: auto-detects and parses lcov.info (node-ts/node-js/rust), Istanbul JSON (coverage-summary.json/coverage-final.json), Cobertura XML (python/java/dotnet), go coverage.out, tarpaulin JSON, xcresult (swift, optional). Severity: `< 50%` = High, `< 80%` = Medium, `0% on a file changed in this block` = Critical.
- **Pyramid (P1-P3)**: categorizes discovered tests as unit / integration / e2e by path convention and framework imports (`@playwright/test`, `cypress`, `detox`, `selenium`). Target ~70/20/10. Flags inverted (e2e > 30%), middle-heavy (integration > 50%), and single-layer suites.
- **Anti-patterns (T1-T8, all stack-adapted)**: T1 `.only`/`fit`/`fdescribe` committed (Critical), T2 skipped tests (Medium; High if > 10% of suite), T3 `.todo` placeholders (Low), T4 empty test bodies (High), T5 tests without assertions (High), T6 hardcoded sleeps ≥ 500ms (Medium), T7 debug output left in tests (Low), T8 multi-file `.only` pattern (Critical).

Universal gating: installed on every Tier M/L project regardless of feature flags (no `requires`). Backlog prefix: `TEST-`. Flaky-test detection and live re-run analysis are deferred - v1 is static-only.

#### /doc-audit

**File**: `.claude/skills/doc-audit/SKILL.md` | **Tier**: M, L

Static documentation drift audit. Grep / file parsing / filesystem reads only - no URL fetches, no builds, no code execution. Runs in Phase 5d Track C alongside `/test-audit`: drift caught while the change is fresh in memory, not six weeks later when a new contributor trips over it.

Checks:

- **D1 Relative-link resolution**: markdown links to local files (`[text](./path)`, `[text](../path)`) resolve to existing paths. `http(s)://`, `mailto:`, and anchor-only links skipped. Severity: Critical for broken links to user-visible flow docs (CONTRIBUTING, SECURITY, linked guides); High otherwise.
- **D2 Code-block syntax**: fenced blocks tagged `json`, `yaml`, `toml` are parsed with a stack-appropriate tool (`node -e 'JSON.parse'`, `python -c 'yaml.safe_load'`, `python -c 'tomllib.loads'`). Blocks tagged `bash`, `sh`, `text`, unlabelled, or containing template markers (`<...>`, `{{...}}`) are skipped. Severity: High per unparseable block.
- **D3 Tierward placeholder residuals**: uses a pinned list of the ten scaffold tokens (`[TEST_COMMAND]`, `[FRAMEWORK_VALUE]`, `[LANGUAGE_VALUE]`, `[INSTALL_COMMAND]`, `[DEV_COMMAND]`, `[BUILD_COMMAND]`, `[TYPE_CHECK_COMMAND]`, `[E2E_COMMAND]`, `[ENUM_CASE_CONVENTION]`, `[MIGRATION_COMMAND]`). Every entry is verified against `packages/cli/templates/**` so only tokens the scaffold actually writes are included. Generic `[UPPERCASE]` regex is deliberately avoided to prevent false positives on legitimate user conventions (`[API_KEY]`, `[YOUR_DOMAIN]`, `[FEATURE_FLAG]`). Severity: Critical in `README.md`, High in other user-facing docs.
- **D4 Slash-command name match**: every `/name` reference in docs is cross-checked against `.claude/skills/<name>/`. Allowlist covers Tierward CLI verbs (`init`, `upgrade`, `doctor`, `add`, `new`). Severity: Medium per orphan.
- **D5 Skill-count consistency**: numeric claims like "16 skills" in README / docs are cross-verified against `ls .claude/skills/ | grep -v '^custom-' | wc -l`. Severity: Medium if mismatch ≤ 2; High if > 2. Scope is intentionally narrow - doctor / test counts are source-specific to the Tierward codebase and not in scope for user-project audits.
- **D6 ADR marker freshness**: if an ADR directory is configured, frontmatter `date:` / `updated:` fields older than 180 days without a terminal `status:` (`accepted`, `deprecated`, `superseded`, `rejected`) are flagged. Severity: Low.
- **D7 Stack-specific doc sync**: runs only for `node-ts`, `python`, `swift` - other stacks skip D7 and run only D1-D6. Patterns live in a sibling `PATTERNS.md`:
  - **node-ts**: Next.js `app/` or `pages/` routes cross-referenced against `docs/sitemap.md` and README; `package.json` dependencies cross-referenced against README.
  - **python**: Django `urls.py` paths cross-referenced against `docs/sitemap.md` and README; `pyproject.toml` / `requirements.txt` top-level deps cross-referenced against README.
  - **swift**: `Package.swift` products and targets cross-referenced against README; DocC presence hint for library targets.

Severity: Medium per orphan surface (D7 patterns are best-effort hints, not hard validation).

Universal gating: installed on every Tier M/L project regardless of feature flags (no `requires`). Backlog prefix: `DOC-`. Live link check (HTTP/HTTPS), semantic drift reasoning, and doc-bloat judgement are deferred - v1 is static only. Read-only: the skill produces a markdown report; corrections are proposed but never applied.

#### /api-contract-audit

**File**: `.claude/skills/api-contract-audit/SKILL.md` | **Tier**: M, L | **Requires**: `hasApi=true`

Static OpenAPI contract audit. Reads the spec (committed file or framework auto-gen) and cross-references it with route handlers in the codebase. Complements `/api-design` (forward-looking, new-route review) by catching contract drift on existing endpoints.

Checks:

- **AC1 Endpoint drift**: set-diff between `SpecEndpoints` and `CodeEndpoints`. Routes implemented without spec entry = High; spec endpoints without handler = Critical (clients hit 404).
- **AC2 Schema drift**: request body schema (spec) vs request validation schema in code (Zod / Pydantic / io-ts / class-validator); response body schema vs handler return shape. Field-level comparison; type mismatches flagged High.
- **AC3 Status-code mismatch**: spec `responses:` keys vs `res.status(N)` / `HTTPException(status_code=N)` in handler body. Medium per mismatch; High when the mismatch breaks documented contract (spec says 200, code returns 201).
- **AC4 Breaking-change detection**: if the spec is tracked in git, diff against `HEAD~1` via `git show HEAD~1:<spec-path>`. Flags Critical: required field removed, enum value removed, status code removed, path removed without prior `deprecated: true`, type change, response field removed. Non-breaking additive changes are Low informational.
- **AC5 Versioning consistency**: path-versioned specs (`/v1/`, `/v2/`) should share the same major prefix or match `info.version`. Mixed-version specs flagged Medium.
- **AC6 Security scheme alignment**: `securitySchemes` in spec vs auth middleware in code (`requireAuth`, `@UseGuards(AuthGuard)`, `Depends(get_current_user)`, `permission_classes = [IsAuthenticated]`). Mismatches High.
- **AC7 Deprecation markers**: `deprecated: true` endpoints should have `Sunset:` header or `x-sunset` with date. Endpoints deprecated > 180 days without sunset = Medium.
- **AC8 Richardson Maturity Model scoring (L0-L3)**: per-endpoint classification. L0 (RPC over HTTP), L1 (resource URLs), L2 (correct HTTP verbs + status codes), L3 (HATEOAS via `_links` / `rel` / `href` / HAL / JSON:API patterns in response schema). L3 detection is best-effort via schema inspection. Overall grade reported as distribution plus aggregate level.

Framework auto-gen (priority order): FastAPI (`$DEV_SERVER_URL/openapi.json` or decorator parsing), NestJS (`@ApiProperty` decorators), Express + swagger-jsdoc (JSDoc annotations), Next.js 13+ route handlers (`app/api/*/route.ts` + Zod), Django REST Framework (`drf-spectacular` / `drf-yasg`). Patterns in sibling `PATTERNS.md`. Other frameworks fall back to static-file-only mode.

Modes: `mode:drift` (AC1-AC3 only), `mode:richardson` (AC8 only), `mode:all` (default). Backlog prefix: `API-`. Runs in Phase 5d Track B. AC4 requires git history; skipped gracefully if unavailable.

#### /infra-audit

**File**: `.claude/skills/infra-audit/SKILL.md` | **Tier**: M, L

Static infrastructure-security audit across five layers: GitHub Actions, Dockerfile, Kubernetes manifests, Terraform, GitLab CI. Each layer runs only if its markers are detected at Step 1 - no noisy N/A sections for absent layers. Stack-agnostic: infrastructure is orthogonal to the backend language.

Checks per layer (full list in SKILL.md; Critical / High shown here):

- **GitHub Actions** (GHA-1 to GHA-7): pwn-request pattern (`pull_request_target` + PR head checkout) = Critical; secret logging (`echo ${{ secrets.X }}`) = Critical; self-hosted runner on public PR = Critical; unpinned actions (no SHA) = High; permissions overreach (no explicit `permissions:` block + token writes) = High; untrusted input in run commands = High; workflow modification permission = Medium.
- **Dockerfile** (D-1 to D-6): secret baked into ARG/ENV = Critical; running as root in final image = High; `ADD https://...` = High; latest-tagged base image = Medium; unpinned base image (no digest) = Medium; apt install without cleanup = Low.
- **Kubernetes** (K-1 to K-7): `privileged: true` container = Critical; `hostNetwork`/`hostPID`/`hostIPC` = Critical; `runAsNonRoot: false` or missing = High; `allowPrivilegeEscalation: true` = High; writable rootfs (missing `readOnlyRootFilesystem`) = Medium; secret as env var = Medium; `imagePullPolicy: IfNotPresent` with mutable tag = Low.
- **Terraform** (T-1 to T-6): IAM wildcard action (`Action: "*"` or `Action: "<service>:*"`) = Critical; hardcoded secret in `.tf` literal = Critical; IAM wildcard resource = High; public S3 bucket (`public-read` / `public-read-write`) = High; state file (`*.tfstate*`) committed to git = High; module without version pin = Medium.
- **GitLab CI** (GL-1 to GL-4): secret logging = Critical; script injection via `$CI_COMMIT_MESSAGE` / `$CI_MERGE_REQUEST_TITLE` = High; unprotected runner consuming protected variables = High; unpinned image = Medium.

Patterns in sibling `PATTERNS.md` (five sections, one per layer). Backlog prefix: `INFRA-`. Runs in Phase 5d Track C on every block alongside `/test-audit` and `/doc-audit`. Static file analysis only: does not connect to cloud providers or clusters.

#### /compliance-audit

**File**: `.claude/skills/compliance-audit/SKILL.md` | **Tier**: M, L

Static compliance audit with regulatory profiles. v1.14 ships the GDPR profile active; SOC 2 and HIPAA profiles are scaffolded in `PROFILES.md` as future-markers with their check taxonomies and backlog prefixes reserved, waiting on real enterprise validation before enablement. The audit produces mechanical findings only - legal compliance attestation requires human counsel review.

GDPR checks (10 checks across 4 pillars):

- **Data subject rights** (G1-G3): right to delete (Article 17) - Critical if no delete endpoint for user data exists, High if the endpoint exists but cascade delete to associated records is not evident; right to export (Article 20) - High if no export endpoint; right to rectification (Article 16) - Medium if no update endpoint for user profile data.
- **Lawful basis + consent** (G4-G5): consent capture - High if PII is handled without consent artifacts (cookie banner, consent ledger, `consent` table); Medium if consent exists but is non-granular (single boolean for all purposes); lawful basis declaration - Medium if `[PRIVACY_DOC_PATH]` is set but lacks Article 6 language (consent, contractual necessity, legal obligation, legitimate interest, vital interest, public interest).
- **Security measures** (G6-G8): PII field identification - informational, scans schema for columns matching a PII vocabulary (email, phone, ssn, address, birthdate, IP, credit card, special-category per Art. 9); encryption-at-rest for special-category - High per unencrypted field in the Art. 9 list (health, genetic, biometric, religion, ethnicity); PII logging hygiene - High per logging call that expands a PII field raw.
- **Accountability** (G9-G10): retention policy declaration - Medium if PII is stored but no retention window is declared anywhere searchable; sub-processor transparency - Low informational, cross-references third-party SDK packages and env-var keys against a `docs/sub-processors.md` or `[PRIVACY_DOC_PATH]`.

Output includes a mechanical **GDPR readiness tier** (foundational / operational / mature) based on Critical and High finding counts. The tier is explicitly mechanical and does not constitute legal attestation.

Backlog prefix: `GDPR-` (SOC 2 and HIPAA reserve `SOC2-` / `HIPAA-` for v1.15+). Runs in Phase 5d Track B when a block touches PII fields, user-data endpoints, consent flow, or third-party SDK integration. Stack-agnostic: GDPR applies to any EU-facing product regardless of backend language.

#### /skill-review

**File**: `.claude/skills/skill-review/SKILL.md` | **Tier**: M (lite), L (full)

Quality review pipeline for skill portfolios. Runs Phase 1 preflight (C1–C8 spec compliance) → **Phase 1 → Phase 2 mechanical gate** (8-step PASS|FAIL table, no judgment override) → Phase 2 structural review (fundamentals, cross-tier coherence, refinements, behavioral fixtures across 11 stack-dependent skills) → Phase 3 fix + rollback → Phase 6 closeout. Tier M lite mode skips Phase 4 (external LLM review), Phase 9 (midpoint drift check), and Phase 10 (final mechanical sweep). Tier L full mode runs all phases, including a portfolio-level Phase 10 mechanical sweep at cycle closure: Phase 1 is re-run against the final framework spec to surface residual drift on skills reviewed early in the cycle. Ships with 5 supporting documents: REVIEW_FRAMEWORK.md, SEVERITY_SCALE.md, SPEC_SNAPSHOT.md, SKILLS_INVENTORY.md, CALIBRATION_KIT.md.

#### /simplify

**File**: `.claude/skills/simplify/SKILL.md` | **Tier**: S, M, L

Unlike other skills, this one **applies changes directly**. Targets: early returns to reduce nesting, dead code removal, unnecessary complexity. Run after implementation in Phase 2.

#### /commit

**File**: `.claude/skills/commit/SKILL.md` | **Tier**: S, M, L

Conventional Commits automation. Auto-detects commit type, scope, and description from staged changes.

#### /dependency-audit

**File**: `.claude/skills/dependency-audit/SKILL.md` | **Tier**: M, L | **Backlog prefix**: `DEP-n`

Outdated-package audit with severity classification. Three tiers: Tier A (safe batch — patch and minor bumps for non-core packages), Tier B (non-core major), Tier C (core or breaking-risk). Tier B and Tier C entries include a one-paragraph changelog summary plus a grep-based codebase impact note. Runtime LTS status is reported alongside the package report. Stack-aware (`node-ts`, `python`, `swift`); other stacks fall back to a generic outdated-listing pass.

When the [`package-registry-mcp`](https://github.com/Artmann/package-registry-mcp) server is wired in `.mcp.json`, Step 2 calls `mcp__package-registry-mcp__lookup_package` for current package metadata (latest version, repository URL, maintainer, dist-tags) and uses the returned repo URL to fetch the GitHub releases changelog. Falls back to WebFetch with an explicit warning when the MCP server is unreachable. Audit-only in v1; mutating apply-tier-a is deferred.

#### /pr-review

**File**: `.claude/skills/pr-review/SKILL.md` | **Tier**: M, L

Autonomous local pull-request review via the `gh` CLI. Spawns a review subagent on the PR diff, classifies findings as Critical / Major / Minor using universal plus stack-specific severity criteria, and posts the review as a PR comment for audit trail. Configurable through `.claude/team-settings.json` `prReviewSeverity`. Read-only — no merges, no code changes. The `--deep` flag escalates the subagent to opus for sensitive changes. The skill is also exposed as the `tierward_pr_review` MCP tool, which reads existing review comments rather than generating fresh ones.

---

## 11. Pipeline-integrated skills (Tier M / L)

Two pipeline-integrated skills are scaffolded in `.claude/skills/`. They are invoked during specific pipeline phases as forked-context sub-processes, returning structured results to the main session.

### Design principle

Skills are used only where tasks are **genuinely independent and read-only**. The pipeline keeps Phase 2 (implementation) and document-update phases monolithic. Sequential, single-session writes are traceable and human-reviewable.

### /dependency-scan (Tier M + L - Phase 1)

**File**: `.claude/skills/dependency-scan/SKILL.md`

The dependency scan has 6 checks that are structurally independent. Invoked via `/dependency-scan` in a single call, they run in a forked context and return a structured report with file paths and line numbers.

The skill receives all affected entities in one prompt (routes, components, shared types, DB tables). It returns a report structured by check (C1-C6) with a "Mandatory additions" section. The orchestrator adds every file from "Mandatory additions" to the file list before presenting the Phase 1 STOP gate.

### /context-review (Tier L only - Phase 8.5)

**File**: `.claude/skills/context-review/SKILL.md`

Handles checks C1-C3 of the context review (credential scan, placeholder scan, field name staleness). These are pure grep operations with no dependencies on each other and require no judgment.

**In Tier M**: all 12 context review checks (C1-C12) run in the main session. The `/context-review` skill is not used.

### What stays monolithic

| Phase                    | Reason                                                                  |
| ------------------------ | ----------------------------------------------------------------------- |
| Phase 2 - Implementation | Writes have cross-file dependencies; sequential authorship is auditable |
| Phase 3 - Build + tests  | Sequential toolchain constraint (type check -> build -> test)           |
| Phase 8 - Block closure  | Document updates have content dependencies between them                 |
| Phase 8.5 C4-C12         | Require judgment about the current block's state                        |

---

## 12. Custom skills

You can create project-specific skills that Tierward preserves across `upgrade` and `init` operations.

### Convention

Place custom skills in `.claude/skills/custom-<name>/SKILL.md`. The `custom-` prefix signals Tierward to never overwrite, prune, or modify the skill during any CLI operation.

```
.claude/skills/custom-deploy/SKILL.md
.claude/skills/custom-code-review/SKILL.md
.claude/skills/custom-db-seed/SKILL.md
```

### SKILL.md format

Every skill file has YAML frontmatter and a markdown body with step-by-step instructions.

**Required frontmatter fields**: `name`, `description` (max 250 chars), `user-invocable` (true/false), `model` (haiku/sonnet/opus), `context` (always `fork`).

**Optional fields**: `effort` (low/medium/high), `argument-hint` (parameter syntax), `allowed-tools` (MCP tools the skill needs).

**Model selection**:

- **haiku**: Pattern-matching, classification, grep-based checks, commit messages. Fast, cheap.
- **sonnet**: Analysis requiring judgment, multi-file reasoning, security audits, design reviews.
- **opus**: Visual analysis (screenshots, UI review), complex architectural reasoning.

### Minimum viable custom skill

```markdown
---
name: custom-check-deps
description: Check for outdated dependencies and report major version bumps.
user-invocable: true
model: haiku
context: fork
---

## Step 1 - Check outdated packages

Run the appropriate command for the project's package manager:

- npm: `npm outdated --json`
- pip: `pip list --outdated --format=json`

## Step 2 - Report

List packages with major version bumps:

| Package | Current | Latest | Breaking? |
| ------- | ------- | ------ | --------- |
| name    | x.y.z   | a.b.c  | yes/no    |
```

After creating a custom skill, add it to the `## Active Skills` section in CLAUDE.md. See [Custom Skills Guide](custom-skills.md) for the full authoring reference.

---

## 13. Governance mechanics

### Stop hook

The Stop hook runs your test command every time Claude tries to declare a task complete. If tests fail, the hook returns a block decision and Claude must fix the failure before proceeding.

```json
"Stop": [{
  "hooks": [{
    "type": "command",
    "command": "npm test || echo '{\"decision\": \"block\", \"reason\": \"Tests must pass before declaring complete.\"}'"
  }]
}]
```

Replace `npm test` with your actual test command. The command must exit 0 on success. Present in every tier, including Discovery.

---

### Audit log

Every tool use (file read, file write, bash command) is logged to `~/.claude/audit/<project>.jsonl`. Append-only. Each entry includes timestamp, tool name, input parameters, and session ID. Local to your machine - not committed to the repository.

---

### LLM security review (Tier L)

At session close, a Haiku call checks for hardcoded secrets or tokens, new routes without authentication checks, and `eval()` or `exec()` on user-provided input. If issues are found, the session close is blocked.

---

### AI commit attribution

Every commit made during a Claude Code session includes `Co-authored-by: Claude <noreply@anthropic.com>`. This makes AI contributions visible in `git log` and GitHub's contributor history.

---

### CODEOWNERS

`.github/CODEOWNERS` requires tech lead review on `.claude/` changes. No change to the governance layer can be merged without a human review. Claude cannot silently modify its own constraints.

---

### Pre-commit hooks

`.pre-commit-config.yaml` includes **gitleaks** (scans for secrets) and **AI commit audit** (flags Claude co-authored commits for team awareness).

```bash
pip install pre-commit
pre-commit install
```

If gitleaks finds a secret: the commit is blocked. Fix by removing the secret and adding the file to `.gitignore`.

---

## 14. Conventions and non-negotiables

These apply in all tiers:

**Branch discipline**

- Never commit directly to `main` or `staging`
- Features: `feature/block-name`
- Fixes: `fix/description`

**Conventional commits**

```
feat(scope): add user notifications
fix(auth): handle expired token on refresh
docs: update API guide
chore: bump dependencies
```

Imperative mood, under 72 characters. Scope is optional but encouraged.

**STOP gates are hard stops** - not suggestions. Never say "yes continue" to a requirements summary you haven't read. The gate exists for a human decision checkpoint.

**Tests before declare-done** - Claude cannot mark a task complete with failing tests. To temporarily disable (dry-run, docs-only task): set `"Stop": []` in `settings.json`, then restore immediately after.

**No unrequested changes** - Claude implements only what was approved in Phase 1. Adjacent problems go to the session file and refactoring backlog.

**Secret hygiene** - Never commit `.env`, `.env.local`, `.env.production`, or any file containing tokens, API keys, or passwords.

---

## 15. Maintaining the scaffold

### Upgrading

```bash
npx tierward upgrade
npx tierward upgrade --tier=m            # promote to higher tier
npx tierward upgrade --anthropic         # show diff for Anthropic-influenced files (dry-run)
npx tierward upgrade --anthropic --apply # write the diff with .bak backup
```

Non-destructive files are updated to the latest template version (rules, context-review, files-guide, PR template). Files containing your customizations (`CLAUDE.md`, `pipeline.md`, `settings.json`, `SKILL.md` files) are flagged for manual review.

**`--anthropic` flag** (added in v1.15.0): runs a separate refresh flow targeted at files that encode Anthropic spec / best practices. Default behavior is dry-run — prints a colourized unified diff for each file that differs from the installed template. `--apply` writes the new content with a timestamped backup (`<original>.bak.<ISO-timestamp>`) of the previous version. v1.15.0 scope is one file: `.claude/skills/arch-audit/advanced-checks.md`. Other Anthropic-touching files (`pipeline-standards.md`, `claudemd-standards.md`, `arch-audit/SKILL.md`) pass through the scaffold's placeholder substitution or section-stripping pipeline; expanding the registry needs a transformation-aware compare, tracked for v1.16+.

**Custom skills are preserved** - any directory matching `.claude/skills/custom-*/` is never touched during upgrade. The CLI reports which custom skills were found and confirms they are unchanged.

---

### Checking setup health

```bash
npx tierward doctor           # interactive report (default)
npx tierward doctor --report  # JSON compliance output for CI pipelines
npx tierward doctor --ci      # silent mode: exit 1 if any check fails
```

Runs 29 checks:

1. Claude Code CLI is installed and reachable
2. `CLAUDE.md` is present
3. `CLAUDE.md` is under 200 lines
4. `.claude/settings.json` is present and valid JSON
5. `.claude/rules/pipeline.md` exists
6. `.claude/rules/security.md` exists
7. `.env` files are covered by `.gitignore`
8. No secrets (API keys, tokens) found in `CLAUDE.md`
9. Stop hook is configured with a non-empty command
10. Stop hook command has no unfilled `[TEST_COMMAND]` placeholder
11. `.github/CODEOWNERS` covers `.claude/`
12. `.claude/rules/output-style.md` present (all tiers, including Tier 0 - warn if missing)
13. `docs/claudemd-standards.md` present (Tier M/L - warn if missing)
14. `docs/pipeline-standards.md` present (Tier M/L - warn if missing)
15. `.claude/skills/commit/` present (Tier M/L - warn if missing)
16. Skills invoking Playwright `browser_*` tools declare `allowed-tools` frontmatter (warn if missing)
17. Skills use space-separated `allowed-tools` per Anthropic spec (warn on commas)
18. Skill bodies respect Anthropic ≤ 500 lines guideline (warn if oversized)
19. `.claude/settings.json` has no unfilled `[UPPERCASE]` placeholders (warn)
20. CLAUDE.md Key Commands include the Stop hook test command (warn on drift)
21. CLAUDE.md `## Active Skills` matches `.claude/skills/` directories (warn on mismatch)
22. `pipeline.md` H1 matches its phase structure — Tier S/M/L self-consistency (warn)
23. `security.md` variant matches the detected stack (warn on drift)
24. `.claude/rules/context-review.md` includes C12 (warn if not present - upgrade needed)
25. Stop hook has `timeout` configured and ≤ 600s (warn if missing - prevents hanging test commands)
26. Anthropic-influenced files match the installed Tierward template — `arch-audit/advanced-checks.md` in v1.15.0 (warn on drift, suggest `upgrade --anthropic`)
27. Repo state matches `.claude/team-settings.json` — minTier ≥ scaffold tier, no blocked skills installed, all required skills present (warn-level; skips when the file is absent)
28. `team-settings.json` runtime enforcement hook is scaffolded and registered on the `Skill` matcher in `.claude/settings.json` (warn-level; skips when `team-settings.json` is absent — added in v1.21.0)
29. No duplicate entries in `permissions.deny` list (warn if duplicates found)

Checks 13-29 are skipped for Tier 0 projects. Check 12 (`output-style.md`) now runs for Tier 0 too, since output-style.md ships in every tier.

**`--report` output**: machine-readable JSON with timestamp, cwd, summary (passed/warned/failed/skipped), and per-check details. Consumed by CI systems or external audit tools.

**CI integration**: `.github/workflows/tierward-verify.yml` (scaffolded by `init`) runs doctor on every PR. Prevents merging when the scaffold is broken or bypassed.

---

### Team-wide policy with `team-settings.json`

For teams that want to enforce a baseline across every member's clone, drop a `.claude/team-settings.json` into the repo. The file is opt-in: when absent, Tierward behaves as before. When present, the CLI applies the policy at every relevant entry point.

Schema (v1):

```json
{
  "minTier": "m",
  "allowedSkills": ["arch-audit", "security-audit", "test-audit"],
  "blockedSkills": ["custom-experimental"],
  "requiredSkills": ["arch-audit"]
}
```

Field semantics:

- `minTier` — `s` | `m` | `l`. The lowest tier the project may scaffold to. `init` refuses lower tiers. `upgrade` refuses to run on a current scaffold below the floor and points the user at `init --tier=<min>` to promote.
- `allowedSkills` — whitelist for `add skill`. Skills outside the list are rejected. `custom-*` skills bypass this list by design (custom skills aren't part of Tierward governance).
- `blockedSkills` — denylist for `add skill` and the doctor compliance check. `custom-*` skills are NOT exempt from the blocklist (governance overrides the "custom skills preserved across upgrades" convention).
- `requiredSkills` — must be installed in `.claude/skills/`. Doctor warns if any are missing; Tierward does not auto-install on its own.

`allowedSkills ∩ blockedSkills` is rejected at parse time as a mutual-exclusion error.

Enforcement points: `init` (refuse + explain), `upgrade` (refuse + suggest), `add skill` (refuse + explain), and the warn-level doctor check `team-settings-compliance`.

`init-from-context` does not enforce `team-settings.json` because the target directory is greenfield; a parent `team-settings.json` doesn't propagate by design.

v1.16.0 introduced CLI-side enforcement only; native `Skill()` permission rules in `.claude/settings.json` were not generated at the time because Claude Code's permission grammar for skills was not part of the documented public schema. v1.21.0 closed that gap with a `PreToolUse` hook on the `Skill` matcher (`.claude/hooks/team-settings-enforcement.mjs`) that refuses skill invocations violating `blockedSkills` or `allowedSkills` at runtime — covered by doctor check #28 (`team-settings-runtime-hook`).

### MCP server

The `tierward` npm package ships two binaries: `tierward` (the wizard CLI) and `tierward-mcp` (a Model Context Protocol server). Version-locked, single install.

The MCP server exposes Tierward governance state to any MCP-aware client (Claude Desktop, ChatGPT desktop, Cursor, VS Code, Copilot Studio). Six read-only tools:

- `tierward_doctor_report` — runs `doctor --report` and returns the JSON
- `tierward_team_settings` — parsed `.claude/team-settings.json` contents
- `tierward_arch_audit_status` — last arch-audit run timestamp + age in days
- `tierward_skill_inventory` — installed skills with frontmatter snapshot
- `tierward_package_meta` — package name, version, CLI path, project root
- `tierward_pr_review` — reads existing `/pr-review` comments on a GitHub PR (verdict + severity counts). Read-only; to generate a fresh review, invoke the `/pr-review` Tierward skill.

*Note: The legacy `cdk_*` tool names remain available as deprecated aliases for backwards compatibility.*

Wire up by adding to `.mcp.json` (project-scoped) or `~/.claude/.mcp.json` (user-scoped):

```json
{
  "mcpServers": {
    "tierward": { "command": "tierward-mcp" }
  }
}
```

The server resolves the project root from `$TIERWARD_PROJECT_ROOT` (or the legacy `$CDK_PROJECT_ROOT`) if set, otherwise from the calling process's `cwd`. v1.17.0 launched read-only by design; that posture is unchanged through v1.33.1. A read-write surface remains a future-minor decision contingent on adoption signal.

### Adding team-specific rules

Do not edit scaffolded rule files directly if you want upgrade compatibility. Instead:

1. Create `.claude/rules/team.md` with your team-specific rules.
2. Reference it from CLAUDE.md: `See .claude/rules/team.md for additional constraints.`

---

### CLAUDE.md vs. MEMORY.md vs. ADRs

| Content                                                 | Location                           |
| ------------------------------------------------------- | ---------------------------------- |
| Stable project truths (stack, conventions, RBAC)        | `CLAUDE.md`                        |
| Active work state, in-progress lessons, recent patterns | `MEMORY.md`                        |
| Architectural decisions + rationale + AI constraints    | `docs/adr/NNNN-title.md`           |
| Non-obvious patterns stable enough to be permanent      | `CLAUDE.md` Known Patterns section |
| Block-specific state for session recovery               | `.claude/session/block-name.md`    |

---

## 15b. Anthropic drift tracking

Tierward features risk being absorbed as Anthropic ships native Claude Code capabilities. The drift tracker monitors this automatically.

**How it works**: Every Monday at 9 AM UTC, a GitHub Action fetches the Anthropic Claude Code changelog, matches content against a feature manifest (`.github/drift-tracker/features.json`), and opens issues for any overlap detected.

**Feature manifest**: Each entry in `features.json` defines a Tierward feature with keywords, risk level (high/medium/low), and affected Tierward files. To add a new feature to track, add a JSON object to the `features` array.

**Manual scan**: Go to Actions > "Anthropic drift tracker" > Run workflow. Enable "Dry run" to see results without creating issues. Adjust the lookback window with the "days" input.

**Issue management**: Issues are labeled `anthropic-drift` and include the feature ID in the title as `[drift:feature-id]`. The tracker deduplicates by checking for existing open issues with the same feature ID. Stale issues (>30 days) are auto-closed.

**Local dry-run**: `node .github/drift-tracker/check-drift.mjs --dry-run --days=30`

---

## 15c. Template coverage tests (maintainer-only)

Tierward ships normative prose inside `pipeline.md` per tier and inside per-tier `CLAUDE.md` templates. Drift between tiers, broken gate clauses, and undocumented placeholders quietly degrade what customers receive. The template-coverage layer catches these regressions before the templates reach `npm`.

Three standalone scripts under `packages/cli/test/template-coverage/`:

```bash
node packages/cli/test/template-coverage/cross-tier-lint.mjs     # registry-driven cross-tier semantic lint
node packages/cli/test/template-coverage/gate-enum.mjs           # enumerate every gate clause per tier
node packages/cli/test/template-coverage/placeholder-check.mjs   # verify every UPPER_SNAKE_CASE placeholder is documented
```

Pass `--json` to any of them for machine-readable output. Exit code is non-zero on a violation. The three scripts also run as scenarios inside the main integration suite — `node packages/cli/test/integration/run.js` fails if any of them fail.

The concept registry consumed by `cross-tier-lint.mjs` lives in `packages/cli/test/template-coverage/cross-tier-concepts.json`. When adding a new phase or normative paragraph that must remain aligned across tiers, update the registry before changing the templates. The lint will flag the mismatch until both sides agree.

Strategy, cost-benefit, and the explicit decision on deferred approaches (LLM-based semantic eval, behavioral fixture testing): [docs/architecture/test-coverage-strategy.md](architecture/test-coverage-strategy.md).

---

## 15d. Cross-LLM rubric for Context Builder (maintainer-only)

The Context Builder produces `CONTEXT.md` files that feed the rest of the scaffold. A deterministic schema validator covers structural correctness (16 MUST PASS criteria), but semantic quality (whether the description reflects reality, whether `tier.rationale` is non-tautological, whether inferred source files actually exist) requires human-level judgment. The cross-LLM rubric automates that judgment by asking three independent models to score each criterion 0-3, then aggregating by median.

```bash
node scripts/cross-llm-rubric.mjs \
  --context path/to/CONTEXT.md \
  --out path/to/output-dir/ \
  [--repo-summary path/to/repo-summary.md]
```

Output: `report.json` (machine-readable), `report.md` (human-readable table), and `raw-<provider>.txt` for each model.

The locked jury is `claude-opus-4-8` + `claude-sonnet-4-6` + `gemini-2.5-pro`. PASS requires all medians ≥ 2 **and** ≥ 80 % of criteria with median ≥ 2. The script hard-fails (exit 2) if `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` is missing, and hard-fails at runtime (exit 1) on any provider network error; a model that responds with malformed JSON is penalised in scoring rather than crashing the run.

This is a maintainer gate: run it before any release that touches `packages/cli/src/context-builder/**`, the schema, or prompt templates. End users do not run it; they get the deterministic MUST PASS via `npx tierward validate-context`.

Full reference: `packages/cli/test/cross-llm-rubric/README.md`. Locked design in `memory/project_context_builder_rubric_v1.md`.

---

## 16. Frequently asked questions

**Q: Do I need to run `npx tierward init` every time I start a session?**

No. You run it once to scaffold the governance layer. After that, open Claude Code (`claude`) from the project root. The governance files load automatically.

---

**Q: What happens if Claude ignores the pipeline?**

The Stop hook is a mechanical enforcement: it does not rely on Claude following instructions. Even if Claude tries to declare a task complete without running tests, the hook blocks it. The STOP gates rely on Claude respecting the instructions in `pipeline.md`. If you observe Claude skipping a gate, check that `pipeline.md` is being loaded (run `npx tierward doctor`).

---

**Q: Can I use this with a non-Node.js project?**

Yes. The CLI supports 11 tech stacks: Node.js/TS, Node.js/JS, Python, Go, Swift, Kotlin, Rust, .NET, Ruby, Java, and "Other / mixed". The test command, type check command, and build command are all configurable. The pipeline itself is stack-agnostic. Security rules, permissions, and skill checks adapt automatically to your stack.

---

**Q: My project already has a CLAUDE.md. Will in-place init overwrite it?**

No. In-place mode uses safe scaffold: files that already exist are never overwritten. Your existing `CLAUDE.md`, `MEMORY.md`, `.gitignore`, and `README.md` are preserved.

---

**Q: Can I add Tierward components without running the full init?**

Yes. Use `npx tierward add skill <name>` or `add rule <name>` to install individual components. See [section 7](#7-incremental-adoption).

---

**Q: How do I create my own audit skill?**

Create `.claude/skills/custom-<name>/SKILL.md` with YAML frontmatter and step-by-step instructions. The `custom-` prefix ensures Tierward never touches it during upgrade or init. See [section 12](#12-custom-skills) and [Custom Skills Guide](custom-skills.md).

---

**Q: What is CONTEXT_IMPORT.md and can I delete it after discovery?**

After Claude marks the status as `COMPLETE`, the file is a historical record. You can delete it. The pipeline checks for `Status: PENDING_DISCOVERY` specifically, so a `COMPLETE` file does not trigger any workflow.

---

**Q: How do I handle multiple worktrees (parallel feature development)?**

Create each worktree from `staging`, never from `main`:

```bash
git worktree add .claude/worktrees/feature-name -b worktree-feature-name staging
```

Rules: each worktree has its own branch. Merge to `staging` sequentially - smoke-test the first before merging the second. Check migration numbering across worktrees.

---

**Q: Can I switch tiers on an existing project?**

Yes. Run `npx tierward upgrade --tier=m` to promote non-destructively. Or edit `.claude/rules/pipeline.md` directly if you need fine-grained control.

---

**Q: What is the difference between MEMORY.md at the project root and the auto-memory at `~/.claude/`?**

- **Project-root `MEMORY.md`** - committed to the repo. Shared across the team. Contains active block plan and stable lessons. Reviewed by Claude at block closure.
- **Auto-memory (`~/.claude/projects/.../memory/`)** - local to your machine, never committed. Claude Code manages this automatically for session-specific patterns and per-developer notes.

---

**Q: The discovery workflow populated CLAUDE.md with wrong information.**

Edit `CLAUDE.md` directly. Discovery is a one-time bootstrap; you own the file after that.

---

**Q: How do I enable or disable E2E / UAT tests after init?**

Edit `CLAUDE.md` Key Commands section. Replace `# not configured` with your actual command (e.g. `npx playwright test`) to enable, or set it back to `# not configured` to disable. Phase 4 requires three conditions: (1) a real command configured, (2) scope gate confirming critical UI flows, and (3) user-defined UAT scenarios (numbered user journeys).

---

**Q: Can I run `init` non-interactively for CI or scripted provisioning?**

Yes. All init commands accept `--answers <path>` that bypasses every wizard prompt:

```bash
npx tierward init --answers ./answers.json
```

Nine example fixtures are in `packages/cli/test/fixtures/wizard-answers/`. Copy one as a starting point.

---

_Last updated: 2026-06-22 - v1.33.1_
