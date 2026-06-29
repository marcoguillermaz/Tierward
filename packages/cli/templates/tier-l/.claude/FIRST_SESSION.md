# First Session Guide - [PROJECT_NAME]

Your development scaffold is ready. This guide walks through setup and your first block cycle under the Full Pipeline (Tier L).

---

## What was created

| File | Purpose |
|---|---|
| `CLAUDE.md` | Project context - fill this in first |
| `MEMORY.md` | Active plan + lessons (updated by Claude, not by hand) |
| `.claude/rules/pipeline.md` | 11-phase development pipeline + R1–R4 |
| `.claude/rules/context-review.md` | End-of-block compliance checklist (C1–C12) |
| `.claude/skills/dependency-scan/SKILL.md` | Phase 1: dependency scan skill (`/dependency-scan`) |
| `.claude/skills/context-review/SKILL.md` | Phase 8.5: C1–C3 grep checks skill (`/context-review`) |
| `.claude/settings.json` | Hooks: test gate, weekly arch-audit reminder, PostCompact |
| `docs/requirements.md` | Product specification |
| `docs/implementation-checklist.md` | Block-by-block progress tracker |
| `docs/refactoring-backlog.md` | Tech debt tracker |

---

## Before your first session

[ENVIRONMENT_SETUP]**1. Fill in `CLAUDE.md`** - replace every `[PLACEHOLDER]`:
- Overview: what the product does and who uses it
- Tech stack: framework, language, database, auth, storage, email, deploy (framework + language are auto-populated)
- Key commands: install, dev, build, test, type-check (auto-populated from wizard)
- Coding conventions: any non-obvious rules for your codebase

**Sections removed to save context tokens** - add them back to `CLAUDE.md` when you have real content:
- `## RBAC / Roles` - role/permission table (copy from tier template or write your own)
- `## Key Workflows` - state machines, approval flows, document lifecycle
- `## Navigation by Role` - role-to-page mapping table
- `## Known Patterns` - non-obvious gotchas discovered during development

**2. Fill in `docs/requirements.md`** - define your blocks in priority order. Include acceptance criteria. This is what Claude reads at Phase 1.

**3. Verify your test command works**:
```bash
[TEST_COMMAND]
```
It must exit 0 before Claude can declare any task complete (enforced by the Stop hook in `.claude/settings.json`).

**4. (Optional) If you have E2E tests configured**: verify `[E2E_COMMAND]` in CLAUDE.md is correct. If not applicable, the line reads `# not configured` - Phase 4 will be skipped automatically.

---

## Your first Claude session

```bash
claude
```

Claude reads `CLAUDE.md`, `MEMORY.md`, and `.claude/rules/pipeline.md` at startup. It orients itself in Phase 0 - creates a session recovery file, reads active overrides, aligns on current block state.

**Starting a new block:**

```
Start a new block: [describe what you want to build in one sentence]
```

Claude will:
1. Create `.claude/session/block-[name].md` - recovery file for interrupted sessions
2. Read `docs/requirements.md` and `docs/implementation-checklist.md`
3. Run a scope review (Phase 1, Tier 1 or Tier 2 sweep)
4. Run `/dependency-scan` for a 6-check dependency analysis
5. Wait for your explicit confirmation before writing any code

**Execution keywords** - the only phrases that authorize autonomous action after a STOP gate:

> `Execute` · `Proceed` · `Confirmed` · `Go ahead`

Read-only operations (Read, Grep, git status/log) always run without confirmation.

---

## The 11-phase pipeline

| Phase | What happens | Gate |
|---|---|---|
| 0 - Session orientation | Session file, branch check, CLAUDE.local.md, context align | - |
| 1 - Requirements | Scope review (Tier 1 or EARS Tier 2) + dependency scan | ⏸ STOP |
| 1.5 - Design review | Data flow + trade-offs (>5 files or new patterns) | ⏸ STOP |
| 1.6 - Visual & UX design | ASCII wireframe + design system mapping (UI blocks) | ⏸ STOP |
| Plan lock | EnterPlanMode + auto-accept prompt + /compact | - |
| 2 - Implementation | Code + security checklist + migration protocol | - |
| 3 - Build + unit tests | Type check, build, unit tests | - |
| 3b - API integration tests | Auth, authz, validation, business rules (if API routes) | - |
| 4 - E2E tests | Playwright/Cypress (if configured + UI flows confirmed) | - |
| 5b - Test data setup | Representative records for all states (cleanup-first) | - |
| 5c - Staging deploy | Merge to staging + smoke test (light + dark) | - |
| 5d - Block-scoped quality audit | /ui-audit → /visual-audit → /ux-audit → /responsive-audit | - |
| 6 - Outcome checklist | Full verification report + design system compliance | ⏸ STOP |
| 8 - Block closure | Session file deleted, docs updated, ADR if needed, 3-commit sequence | - |
| 8.5 - Context review | C1–C3 via /context-review, C4–C11 in main + /compact | - |

**STOP gates** are hard stops - Claude waits for your explicit confirmation before proceeding.

---

## Scope gate: Tier 1 vs EARS Tier 2

At Phase 1, Claude auto-selects sweep depth based on block complexity:

| Signal | Tier |
|---|---|
| ≤5 files, single entity, no migration | Tier 1 - Standard Sweep |
| >5 files, new entity, migration, new integration, or multi-role change | Tier 2 - EARS Deep Sweep |

Tier 2 adds EARS-style analysis: WHEN (triggers), IF/THEN (conditions), WHILE (states), WHERE (role/config gates), plus a pre-mortem. You can always override.

At the scope gate, Claude also declares whether **Phase 4 E2E** and **Phase 5d quality audit** apply to this block.

---

## Key commands

| Command | What it does |
|---|---|
| `/arch-audit` | Audits governance files vs. latest Anthropic docs (run weekly) |
| `/security-audit` | Reviews API routes and auth guards |
| `/skill-dev` | Code quality and tech debt audit — see `.claude/skills/skill-dev/AGENT_PATTERN.md` to run checks in parallel or chain into a Workflow pipeline |
| `/skill-db` | Database schema and query audit |
| `/visual-audit` | Visual polish review via Playwright screenshots |
| `/ux-audit` | User experience flow analysis |
| `/responsive-audit` | Breakpoint correctness (375px / 768px / 1024px) |
| `/perf-audit` | Rendering boundaries, bundle size, N+1 patterns |
| `/compact` | Frees context window (run at Phase 8.5) |
| `npx tierward doctor` | Checks your scaffold setup |

---

## R1–R4: Structural Requirements Changes

When stakeholders change scope on already-implemented blocks, use the R1–R4 pipeline (in `.claude/rules/pipeline.md`):
1. **R1** - Update requirements section by section (STOP after each)
2. **R2** - Impact analysis across implemented blocks
3. **R3** - Updated implementation plan + refactoring-backlog delta (STOP)
4. **R4** - Execution block by block following the standard pipeline

---

## Recovery

- **Session interrupted?** `.claude/session/block-*.md` has the recovery state. Start Claude - it reads the file and resumes automatically.
- **After /compact**: Claude re-reads `.claude/CLAUDE.local.md` automatically (PostCompact hook).
- **Tests failing?** Claude cannot declare completion. Fix tests or use `git stash` to isolate.
- **Scope expanded?** Return to Phase 1 - any scope change must be confirmed before implementation continues.

---

*Remove this file once your team completes the first full block cycle.*
