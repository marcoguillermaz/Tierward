# [PROJECT_NAME] - Project Context

## Overview
[One paragraph: what the product does, who uses it, what problem it solves.]

## Tech Stack
- **Framework**: [FRAMEWORK_VALUE]
- **Language**: [LANGUAGE_VALUE]
- **Database**: [PostgreSQL + RLS / Prisma / Drizzle]
- **Auth**: [Auth mechanism]
- **Storage**: [File storage if any]
- **Email**: [Email provider if any]
- **Deploy**: [Platform + build command + run command]

## RBAC / Roles
| Role | Access |
|---|---|
| `[role_1]` | [what they can do] |
| `[role_2]` | [what they can do] |
| `[role_3]` | [what they can do] |

## Key Workflows
<!-- Document state machines here - approval flows, document lifecycle, etc. -->

```
[STATE_A] → [STATE_B] → [STATE_C]
          ↘ [STATE_REJECTED] (rejection_note required)
[STATE_REJECTED] → [STATE_A] (reopen)
```

## Key Commands
```bash
[INSTALL_COMMAND]
[DEV_COMMAND]
[BUILD_COMMAND]
[TEST_COMMAND]
[TYPE_CHECK_COMMAND]
[MIGRATION_COMMAND]
[E2E_COMMAND]
```

## Navigation by Role
| Role | Areas accessible |
|---|---|
| `[role_1]` | [pages / sections] |
| `[role_2]` | [pages / sections] |

## Coding Conventions
- Product UI language: **[Italian / English / other]**. Code/commits: **English**.
- Status/enum values: `[ENUM_CASE_CONVENTION]`.
- Every API route: verify caller role before any operation.
- Test cleanup pattern: `[TEST_CLEANUP_PATTERN]` (e.g. truncate tables in test setup, clear fixtures in afterEach, reset mock services).
- [Other non-obvious conventions.]

## Known Patterns
<!-- Add non-obvious gotchas here as you discover them. -->
<!-- Format: short title → what → why it matters → how to handle it -->
<!-- Worktree setup: standard for all functional blocks. Document the worktree path, branch prefix,
     and any env copy steps here. See pipeline.md Phase 0 for setup commands.
     Example: worktrees at `.claude/worktrees/[block-name]`, prefix `worktree-`, base `staging`. -->

## Interaction Protocol - Plan-then-Confirm

**Default behavior for all non-trivial requests**: before taking any action that modifies files, configuration, architecture, database, or external systems, Claude must:

1. Confirm understanding of the full scope (what is requested, what is NOT, any ambiguities)
2. List every intended action: file paths, what changes, tools used, any irreversible operations
3. Flag missing information or unclear instructions - ask before acting
4. Wait for an explicit execution keyword before proceeding

**Execution keywords** (the only phrases that authorize autonomous action):
- `Execute` · `Proceed` · `Confirmed` · `Go ahead`

**Exception - active Phase 2**: once a plan is confirmed and an execution keyword was given, Claude proceeds autonomously through implementation without re-confirming each individual file edit or tool call. The confirmation covers the approved plan, not each step.

**Exception - read-only operations**: `Read`, `Grep`, `Glob`, `git status/log/diff` may run without prior confirmation.

Before claiming how code or a system behaves, read the relevant files or output first. If you haven't read them, say so and treat the statement as an assumption.

## Reference Documents
- **Session recovery**: `.claude/session/` - per-block session files.
- **Requirements**: `docs/requirements.md`
- **Progress tracker**: `docs/implementation-checklist.md`
- **Tech debt**: `docs/refactoring-backlog.md`
- **Architecture decisions**: `docs/adr/`
- **Entity contracts**: `docs/contracts/` - field × permission × validation matrices (if applicable)
- **Sitemap**: `docs/sitemap.md` - route × roles × key components (if applicable)
- **Dependency map**: `docs/dependency-map.md` - entity → surfaces lookup (if applicable)

## Environment
- `.env.local` - never commit. Key vars: [list names without values]
- Staging DB: [staging identifier]
- Production DB: [production identifier]
- **Hard rule**: staging credentials only in local dev. Production credentials only on production server.
