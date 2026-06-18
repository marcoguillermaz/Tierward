# Custom Skills Guide

Create project-specific skills that Tierward preserves across `upgrade` and `init` operations.

## Convention

Place custom skills in `.claude/skills/custom-<name>/SKILL.md`. The `custom-` prefix signals Tierward to never overwrite, prune, or modify the skill during any operation.

Examples:
```
.claude/skills/custom-deploy/SKILL.md
.claude/skills/custom-code-review/SKILL.md
.claude/skills/custom-db-seed/SKILL.md
```

## SKILL.md format

Every skill file has two parts: YAML frontmatter (between `---` delimiters) and a markdown body with step-by-step instructions.

### Frontmatter fields

| Field | Required | Values | Purpose |
|---|---|---|---|
| `name` | yes | kebab-case string | Skill identifier. Invoked as `/name`. |
| `description` | yes | 1-2 sentences, max 250 chars | Shown in skill list. Helps Claude decide when to suggest the skill. |
| `user-invocable` | yes | `true` / `false` | Whether users can invoke via `/name`. Set `false` for skills only called by other skills. |
| `model` | yes | `haiku` / `sonnet` / `opus` | Which model runs the skill. See model selection below. |
| `context` | yes | `fork` | Execution context. Always use `fork` to prevent context pollution. |
| `effort` | no | `low` / `medium` / `high` | Execution time signal for the user. |
| `argument-hint` | no | `[opt1\|opt2\|opt3]` | Parameter syntax shown when invoking. Use `target:type:value` pattern for structured args. |
| `allowed-tools` | no | YAML list of tool names | MCP tools the skill needs. Declared upfront for permission requests. |

### Model selection

- **haiku**: Pattern-matching, classification, grep-based checks, commit message generation. Fast, cheap.
- **sonnet**: Analysis requiring judgment, multi-file reasoning, security audits, design reviews.
- **opus**: Visual analysis (screenshots, UI review), complex architectural reasoning.

### Body structure

```markdown
---
name: custom-example
description: One-line summary of what this skill does and when to use it.
user-invocable: true
model: sonnet
context: fork
---

**Scope**: what this skill covers.
**Out of scope**: what it does NOT cover.

## Step 1 - [action]

[Instructions for Claude. Be specific - include file paths, commands, decision criteria.]

## Step 2 - [action]

[Next step. Use tables for classification rules, checklists for validation.]

## Step N - Produce report

[Define the output format. Structured reports work better than prose.]
```

### Patterns that work well

**Scope statement** at the top: 2-3 lines defining what IS and ISN'T covered. Prevents Claude from expanding scope.

**Numbered steps**: Sequential instructions. Claude follows these linearly. Use "Step 0" for setup/validation before the main work.

**Decision tables**: When behavior varies by condition, use tables instead of prose.

```markdown
| Condition | Action |
|---|---|
| No staged files | Stop with message |
| Only test files | Type = `test` |
| Code + tests | Type follows code change |
```

**Applicability check**: For skills that behave differently per project type, add a branching step early:

```markdown
## Applicability check

Read `CLAUDE.md` and check the Framework field.
- **Web project**: proceed to Step 1
- **Native project**: skip to Step 4
```

**Subagent delegation**: For skills with independent sub-checks, delegate to subagents for parallel execution:

```markdown
## Step 2 - Run checks in parallel

Launch two agents concurrently:
- Agent 1: [check A] with model haiku
- Agent 2: [check B] with model haiku

Collect results before proceeding.
```

**Structured output**: End with a defined report format so results are consistent across runs.

## Minimum viable custom skill

The smallest useful skill:

```markdown
---
name: custom-check-deps
description: Check for outdated dependencies and report which ones have major version bumps.
user-invocable: true
model: haiku
context: fork
---

## Step 1 - Check outdated packages

Run the appropriate command for the project's package manager:
- npm: `npm outdated --json`
- pip: `pip list --outdated --format=json`

## Step 2 - Report

List packages with major version bumps. Format:

| Package | Current | Latest | Breaking? |
|---|---|---|---|
| name | x.y.z | a.b.c | yes/no |
```

## Registering custom skills in CLAUDE.md

After creating a custom skill, add it to the `## Active Skills` section in CLAUDE.md:

```markdown
## Active Skills
- `/custom-check-deps` - check for outdated dependencies
```

Or use the CLI: `npx tierward add skill` does not support custom skills (it installs Tierward-managed skills only). Custom skill registration in CLAUDE.md is manual.
