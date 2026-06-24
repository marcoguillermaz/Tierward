# Tiers

Tierward uses four tiers, each one adding more structure and enforcement. Start at the tier that fits your current risk level and move up when you need more.

## Overview

| Tier | Pipeline | Best for |
|---|---|---|
| **0 — Discovery** | Stop hook only | First exploration — zero process overhead |
| **S — Fast Lane** | 4 steps, scope-confirm | Solo dev, low-risk changes, quick fixes |
| **M — Standard** | 13 phases, 3 STOP gates | Feature blocks, 1–2 collaborators |
| **L — Full** | 14 phases, 4 STOP gates | Team projects, complex domain changes |

Every tier includes the Stop hook. Process adds on top, not instead.

## Tier 0 — Discovery

The lightest possible setup. You get a Stop hook that mechanically blocks Claude from completing a task until your tests pass. No pipeline, no audit skills, no governance files beyond what's strictly necessary.

Use Tier 0 when you're exploring Tierward for the first time, running a solo spike, or working on a codebase where the cost of process outweighs the benefit.

```bash
npx tierward init   # select Tier 0 in the wizard
```

## Tier S — Fast Lane

For a single developer moving quickly. Adds four pipeline steps and a scope-confirm gate:

1. Scope confirm — Claude states what it's about to do; you approve or redirect
2. Implementation
3. `/simplify` — early returns, dead code removal, nesting reduction
4. Stop hook — tests must pass

Use Tier S for personal projects, bugfixes, and any work where a lightweight review contract is enough. Most solo projects live here.

```bash
npx tierward upgrade --tier=s
```

## Tier M — Standard

For small teams building features together. Adds 13 development phases with three explicit STOP gates:

- **Gate 1** — After requirements: spec reviewed before any code
- **Gate 2** — After implementation: code reviewed before tests
- **Gate 3** — After testing: QA sign-off before merge

Also enables the team skills library: `/pr-review`, `/dependency-scan`, `/migration-audit`, `/accessibility-audit`, `/test-audit`, and more.

Use Tier M when you're working with at least one other person, shipping features to users, or when the cost of a regression is meaningful.

```bash
npx tierward upgrade --tier=m
```

## Tier L — Full

The tier for team projects with complex domain changes. Adds a fourth STOP gate and the context-review pipeline skill (`/context-review`) that runs after block closure to recompact `CLAUDE.md` and detect context drift before the next block opens.

Use Tier L for regulated environments, large feature sets, or any project where a mistake in one block can silently break another.

```bash
npx tierward upgrade --tier=l
```

## Upgrading

You can move up a tier at any time:

```bash
npx tierward upgrade --tier=m        # promote to Tier M
npx tierward upgrade                  # upgrade template files at your current tier
npx tierward upgrade --anthropic      # preview diff for Anthropic-influenced files
npx tierward upgrade --anthropic --apply  # apply with .bak backup
```

Upgrades are non-destructive. Custom files (anything prefixed `custom-`) are never overwritten.

## Which tier should I use?

- **You're trying Tierward for the first time** → Tier 0
- **Solo project or bugfix** → Tier S
- **Feature work with a collaborator** → Tier M
- **Team of 3+, regulated environment, or high-stakes codebase** → Tier L

When in doubt, start one tier lower. The upgrade path is cheap; the overhead of a tier you don't need is not.
