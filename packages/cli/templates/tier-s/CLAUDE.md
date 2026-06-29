# [PROJECT_NAME] - Project Context

## Overview
[One paragraph: what the product does, who uses it, what problem it solves.]

## Tech Stack
- **Framework**: [FRAMEWORK_VALUE]
- **Language**: [LANGUAGE_VALUE]
- **Database**: [PostgreSQL / SQLite / MongoDB]
- **Auth**: [Supabase Auth / Auth.js / Passport / etc.]
- **Deploy**: [Vercel / Railway / Fly.io / etc.]

## Key Commands
```bash
[INSTALL_COMMAND]     # install dependencies
[DEV_COMMAND]         # start dev server
[BUILD_COMMAND]       # production build
[TEST_COMMAND]        # run tests
[TYPE_CHECK_COMMAND]  # type check (if applicable)
```

## Coding Conventions
- Language: **[English / other]** for code, comments, commits.
- [Any non-obvious formatting rules, naming conventions, or patterns.]

## Known Patterns
<!-- Add non-obvious gotchas here as you discover them. -->
<!-- Format: pattern description → why it matters → how to handle it -->

## Interaction Protocol - Plan-then-Confirm

Before any action that modifies files, configuration, or external systems:
1. List every intended action and flag irreversible operations
2. Wait for an explicit execution keyword: `Execute` · `Proceed` · `Confirmed` · `Go ahead`

**Exception**: `Read`, `Grep`, `Glob`, `git status/log/diff` are always free - no confirmation needed.

Before claiming how code or a system behaves, read the relevant files or output first. If you haven't read them, say so and treat the statement as an assumption.

## Environment
- `.env.local` - never commit. Contains [list key env vars without values].
- [Any non-obvious environment setup.]
