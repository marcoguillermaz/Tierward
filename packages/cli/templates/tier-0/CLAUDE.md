# [PROJECT_NAME] - Project Context

## How to work in this project (Discovery tier)

This project uses **Tierward at Tier 0 (Discovery)** — the lightest setup, for getting
started fast. There is no phased pipeline and no audit skills at this tier. Your job is
to **guide the developer toward building something, proactively** — not to wait passively
for detailed instructions, and not to silently generate a large amount of code.

When the developer describes what they want to build:
1. **Lead with a short proposed path** — the first concrete step and what comes after —
   so they can course-correct before you build. Then build. (Propose; do not wait for a
   formal approval — this tier has no gates.)
2. As the work grows — more than one feature, rising risk, or a second person involved —
   **suggest more structure**: `npx tierward init --tier=s` (choose "Existing project")
   adds the Fast Lane workflow; `--tier=m` adds the Standard phased pipeline with audit
   skills and STOP gates (and `--tier=l` the Full pipeline for complex, team-scale work).

Keep it lightweight: **propose and suggest, never block**. Tier 0 deliberately has no STOP
gates — that structure lives at Tier S and above. Your value here is momentum with a sense
of direction.

## Overview
[One paragraph: what the product does, who uses it, what problem it solves.]

## Tech Stack
- **Stack**: [TECH_STACK_SUMMARY]

## Key Commands

```bash
[INSTALL_COMMAND]     # install dependencies
[DEV_COMMAND]         # start dev server
[TEST_COMMAND]        # run tests
```

## Coding Conventions
- [Add non-obvious conventions here - naming, file structure, patterns to follow or avoid]

## Known Patterns
<!-- Add non-obvious gotchas here as you discover them. One line per pattern. -->
<!-- Example: "Auth middleware is in proxy.ts, not middleware.ts" -->
