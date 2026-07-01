# First Session Guide - [PROJECT_NAME]

Your development scaffold is ready. This guide walks through setup and your first block cycle under the Standard Pipeline (Tier M).

---

## What was created

| File | Purpose |
|---|---|
| `CLAUDE.md` | Project context - fill this in first |
| `MEMORY.md` | Active plan + lessons (updated by Claude, not by hand) |
| `.claude/rules/pipeline.md` | 8-phase development pipeline |
| `.claude/rules/context-review.md` | End-of-block compliance checklist (C1–C12) |
| `.claude/settings.json` | Hooks: test gate, weekly arch-audit reminder |
| `docs/requirements.md` | Product specification |
| `docs/implementation-checklist.md` | Block-by-block progress tracker |
| `docs/refactoring-backlog.md` | Tech debt tracker |

---

## Before your first session

[ENVIRONMENT_SETUP]**1. Fill in `CLAUDE.md`** - replace every `[PLACEHOLDER]`:
- Overview: what the product does and who uses it
- Tech stack: framework, language, database, auth (framework + language are auto-populated)
- Key commands: install, dev, build, test, type-check (auto-populated from wizard)
- Coding conventions: any non-obvious rules for your codebase

**Sections removed to save context tokens** - add them back to `CLAUDE.md` when you have real content:
- `## RBAC / Roles` - role/permission table (copy from tier template or write your own)
- `## Key Workflows` - state machines, approval flows, document lifecycle
- `## Known Patterns` - non-obvious gotchas discovered during development

**2. Fill in `docs/requirements.md`** - list the blocks you plan to implement, in priority order. Even a rough list is enough to start.

**3. Verify your test command works**:
```bash
[TEST_COMMAND]
```
It must exit 0 before Claude can declare any task complete (enforced by the Stop hook in `.claude/settings.json`).

---

## Your first Claude session

```bash
claude
```

Claude reads `CLAUDE.md`, `MEMORY.md`, and `.claude/rules/pipeline.md` at startup. It will orient itself in Phase 0 automatically - create a session recovery file, check the branch, align on context.

**Starting a new block:**

```
Start a new block: [describe what you want to build in one sentence]
```

Claude will:
1. Create `.claude/session/block-[name].md` - a recovery file if the session is interrupted
2. Read `docs/requirements.md` and `docs/implementation-checklist.md`
3. Conduct a scope review (Phase 1) - answer its clarifying questions
4. Wait for your explicit confirmation before writing any code

**Execution keywords** - the only phrases that authorize autonomous action after a STOP gate:

> `Execute` · `Proceed` · `Confirmed` · `Go ahead`

Read-only operations (Read, Grep, git status/log) always run without confirmation.

---

## The 8-phase pipeline

| Phase | What happens | Gate |
|---|---|---|
| 0 - Session orientation | Session file, branch check, context alignment | - |
| 1 - Requirements | Scope review (Tier 1 or Tier 2) + dependency scan | ⏸ STOP |
| 1.5 - Design review | Data flow + trade-offs (blocks >5 files or new patterns) | ⏸ STOP |
| 2 - Implementation | Code + security checklist | - |
| 3 - Build + unit tests | Type check, build, unit tests | - |
| 3b - API integration tests | Auth, authz, validation, business rules (if API routes touched) | - |
| 4 - E2E tests | [E2E_TOOL_NAME] (if configured + UI flows confirmed) | - |
| 5b - Test data setup | Representative records for smoke test | - |
| 5c - Staging deploy | Merge to staging + smoke test | - |
| 6 - Outcome checklist | Full verification report | ⏸ STOP |
| 8 - Block closure | Session file deleted, docs updated, 3-commit sequence | - |
| 8.5 - Context review | C1–C12 checks + `/compact` | - |

**STOP gates** are hard stops - Claude waits for your explicit confirmation before proceeding.

---

## Scope gate: Tier 1 vs Tier 2

At Phase 1, Claude auto-selects a sweep depth based on block complexity:

| Signal | Tier |
|---|---|
| ≤5 files, single entity, no migration | Tier 1 - Standard Sweep |
| >5 files, new entity, migration, or multi-role change | Tier 2 - Deep Sweep |

You can always override the selection. The Tier 2 sweep adds EARS-style analysis (WHEN/IF/WHILE/WHERE dimensions) and a pre-mortem.

---

## Key commands

| Command | What it does |
|---|---|
| `/arch-audit` | Audits governance files vs. latest Anthropic docs (run weekly) |
| `/security-audit` | Reviews API routes and auth guards |
| `/skill-dev` | Code quality and tech debt audit — see `.claude/skills/skill-dev/AGENT_PATTERN.md` to run checks in parallel or chain into a Workflow pipeline |
| `/compact` | Frees context window (run at Phase 8.5) |
| `npx tierward doctor` | Checks your scaffold setup |

---

## Recovery

- **Session interrupted?** `.claude/session/block-*.md` has the recovery state. Start Claude - it reads the file and resumes automatically.
- **Tests failing?** Claude cannot declare completion. Fix tests or use `git stash` to isolate.
- **Scope expanded?** Return to Phase 1 - any scope change must be confirmed before implementation continues.

---

*Remove this file once your team completes the first full block cycle.*
