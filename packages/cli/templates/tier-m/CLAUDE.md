# [PROJECT_NAME] - Project Context

## Overview
[One paragraph: what the product does, who uses it, what problem it solves.]

## Tech Stack
- **Framework**: [FRAMEWORK_VALUE]
- **Language**: [LANGUAGE_VALUE]
- **Database**: [PostgreSQL / SQLite / MongoDB]
- **Auth**: [Auth mechanism]
- **Storage**: [File storage if any]
- **Email**: [Email provider if any]
- **Deploy**: [Platform + build command + run command]

## RBAC / Roles
| Role | Access |
|---|---|
| `[role_1]` | [what they can do] |
| `[role_2]` | [what they can do] |

## Key Workflows
<!-- State machines, approval flows, document lifecycle - anything with states -->

```
[STATE_A] → [STATE_B] → [STATE_C]
          ↘ [STATE_D] (with note required)
```

## Key Commands
```bash
[INSTALL_COMMAND]
[DEV_COMMAND]
[BUILD_COMMAND]
[TEST_COMMAND]
[TYPE_CHECK_COMMAND]
[E2E_COMMAND]
```

## Coding Conventions
- Product UI language: **[Italian / English / other]**. Code/commits: **English**.
- Status/enum values: `[ENUM_CASE_CONVENTION]`.
- Every API route: verify caller role before any operation.
- Test cleanup pattern: `[TEST_CLEANUP_PATTERN]` (e.g. truncate tables in test setup, clear fixtures in afterEach, reset mock services).
- [Other non-obvious conventions.]

## Known Patterns
<!-- Add non-obvious gotchas here as you discover them. -->
<!-- Format: what → why it matters → how to handle it -->

## Interaction Protocol - Plan-then-Confirm

**Default behavior for all non-trivial requests**: before taking any action that modifies files, configuration, or external systems, Claude must:

1. Confirm understanding of the full scope (what is requested, what is NOT, any ambiguities)
2. List every intended action: file paths, what changes, tools used, irreversible operations
3. Flag missing information - ask before acting
4. Wait for an explicit execution keyword before proceeding

**Execution keywords** (the only phrases that authorize autonomous action):
- `Execute` · `Proceed` · `Confirmed` · `Go ahead`

**Exception - active Phase 2**: once a plan is confirmed and an execution keyword was given, Claude proceeds autonomously through implementation without re-confirming each file edit.

**Exception - read-only operations**: `Read`, `Grep`, `Glob`, `git status/log/diff` may run without prior confirmation.

Before claiming how code or a system behaves, read the relevant files or output first. If you haven't read them, say so and treat the statement as an assumption.

## Reference Documents
- **Requirements**: `docs/requirements.md`
- **Progress tracker**: `docs/implementation-checklist.md`
- **Tech debt**: `docs/refactoring-backlog.md`
- **Architecture decisions**: `docs/adr/`

## Environment
- `.env.local` - never commit. Key vars: [list names without values]
- Staging: [staging URL]
- Production: [production URL]
