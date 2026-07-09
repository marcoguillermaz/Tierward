---
name: repo-hygiene
description: Periodic repository cleanup sweep (Tierward repo variant) - finds orphaned/merged git branches, orphaned worktrees and unregistered worktree directories, stale `.claude/session/*.md` files, stale `.claude/initiatives/*.md` files, and (target:full only) orphaned documentation and stale `docs/reviews/` snapshots. Reports every finding with evidence, then executes only the branches/worktrees/session-files the user explicitly confirms via a single AskUserQuestion batch. Never deletes docs/*.md itself - those are always report-only, evidence-based, human-decided. Distinct from the Phase 8 cleanup gate (which tears down one specific block at closure) - this is the periodic sweep that catches what block-by-block cleanup misses.
user-invocable: true
model: sonnet
argument-hint: "[target:full]"
allowed-tools: >
  Bash(bash .claude/skills/repo-hygiene/references/scan-branches-worktrees.sh), Bash(git branch:*),
  Bash(git worktree:*), Bash(git status:*), Bash(git log:*), Bash(git fetch:*),
  Bash(git rev-parse:*), Bash(git show:*), Bash(gh pr list:*), Bash(gh pr view:*),
  Bash(ls:*), Bash(wc:*), Bash(date:*), Bash(stat:*), Bash(find:*), Bash(rm .claude/session/*.md),
  Bash(rm .claude/initiatives/*.md), Bash(mkdir -p docs/reviews/archive), Bash(mv .claude/initiatives/*),
  Bash(rm -rf .claude/worktrees/*),
  Read, Grep, Glob
---

**Tierward repo variant** - diverges deliberately from the scaffolded payload copy (`packages/cli/templates/tier-{m,l}/...`): adds the unregistered-worktree-dir scan, Step 2b (initiatives staleness), and the `docs/reviews/` staleness pass. Do not sync this file back over the payload copies.

Runs in the **main conversation, deliberately without `context: fork`**. `AskUserQuestion` is unavailable to subagents/forked skill contexts, and this skill's confirm-then-execute design requires it mid-run. Do not add `context: fork` to this file.

Goal: search thoroughly, report every candidate with concrete evidence, execute only what the user explicitly confirms. Never guess-execute. Never touch `docs/*.md` regardless of confirmation.

## Step 0 - Parse scope

`$ARGUMENTS`: default = quick scan (Steps 1-2). `target:full` adds Step 3 (doc orphans) - the slow, judgment-heavy, evidence-only pass. State which mode is active before starting.

**Always exclude `.claude/worktrees/**` from every Grep/Glob in Steps 2 and 3.** Worktrees are full repo checkouts - without this exclusion every file inside every active worktree gets reported as a duplicate "root-level" finding.

## Step 1 - Branch & worktree scan (mechanical, always runs)

Run the companion script:
```bash
bash .claude/skills/repo-hygiene/references/scan-branches-worktrees.sh
```

It is read-only and prints three sections:
- `SAFE_BRANCH_DELETE` - bare branch names with no attached worktree, merged into every protected branch that exists on origin (see `PROTECTED_BRANCHES` at the top of the script), no open PR.
- `SAFE_WORKTREE_REMOVE` - `<branch>|<path>` pairs, merged into all protected branches, clean working tree, no open PR. Lines prefixed `KEEP|` are explicitly excluded with a reason (uncommitted changes / not yet merged / open PR / gh check failed) - do not re-litigate these, the script already checked.
- `PRUNABLE_WORKTREE` - paths registered in `git worktree list` whose actual directory no longer exists.
- `ORPHAN_WORKTREE_DIR` - directories on disk under `.claude/worktrees/` that are NOT registered in `git worktree list` (leftovers of a failed/manual removal + prune), with a content summary (`files:N|newest:date`). Git cannot report dirtiness for an unregistered dir, so these NEVER join the low-risk batch: each one gets its own separate confirmation in Step 5, after the content summary is shown, and is removed with `rm -rf` only on that explicit per-item confirm.

The classification is deliberately conservative (merged into ALL protected branches + clean + no open PR; a failed `gh` check reads as unknown, never as "no PR"). Trust it - do not loosen or tighten the criteria ad hoc.

**Safety nets when executing in Step 6**: always `git branch -d` (never `-D` - `-d` refuses on unmerged content, which is your backstop against a misclassification). Always `git worktree remove` without `--force` (refuses if dirty). If either refuses, STOP and report to the user - do not retry with the forced variant.

## Step 2 - Session-file staleness check (judgment, always runs)

For every `.claude/session/*.md` (block-*.md and fix-*.md):

1. Read the file. Note its mtime (`stat`), its front matter, and any `Status:` line.
2. Front matter `block_closed: true` or `fix_closed: true` means the block was closed and the file was kept on purpose at the cleanup gate - classify as **WEAK CANDIDATE** ("archived by choice - delete only if no longer needed").
3. `gh pr list --state merged --search "<slug derived from filename>" --limit 5` - does a merged PR confirm that block is closed?
4. Check `git branch -a` and `git worktree list` for a branch/worktree matching the file's block/branch name.
5. Classify - evidence-based, never by mtime alone in either direction (a fresh in-progress block and a long-blocked-but-still-relevant investigation must both resolve to KEEP absent closure evidence):
   - **STRONG CANDIDATE**: a merged PR confirms closure AND no matching branch/worktree exists anymore.
   - **WEAK CANDIDATE**: closed-and-kept front matter (point 2), OR no merged PR references it AND the file's own status reads as finished/abandoned AND it is several days old. Report with lower confidence, explicit evidence.
   - **KEEP**: recent activity, an in-progress/blocked-pending-external-action status, or a still-existing matching branch/worktree. When in doubt, KEEP.

## Step 2b - Initiatives staleness check (Tierward repo only, judgment, always runs)

For every `.claude/initiatives/*.md` (gitignored, local - deletable like session files, with one hard exception):

- **`roadmap-status.md` is KEEP, always, non-negotiable.** It is the single source of truth for roadmap state. Never list it as a candidate, regardless of any evidence.
- For each other file: read the header/status, note mtime and size, then cross-check closure evidence - does `roadmap-status.md` mark the corresponding item(s) Done/Closed/Deferred-with-criteria? Do merged PRs confirm the plan was executed? Does a superseding doc exist?
- Classify STRONG / WEAK / KEEP with the same evidence discipline as Step 2 (never mtime alone; deferred-with-criteria plans are KEEP - they are the criteria's home).
- For large closed memos (>50KB), offer **archive** (`mkdir -p docs/reviews/archive && mv` the file there) as the default proposal instead of deletion - they carry decision history worth keeping out of the working set but not destroying.

## Step 3 - Documentation orphan sweep (`target:full` only, judgment, evidence-only, NEVER executable)

Scan `docs/**/*.md`, excluding the pipeline-fed canonical set (`requirements.md`, `implementation-checklist.md`, `refactoring-backlog.md`, `sitemap.md`, `db-map.md`, `pipeline-standards.md`, `claudemd-standards.md`, `model-effort-policy.md`, `adr/`, `specs/`, `metrics/`). For each remaining file, check inbound references - Grep across every other tracked doc, every `SKILL.md`, `CLAUDE.md`, and the `.claude/rules/*.md` files. A file with zero inbound references AND content suggesting a closed/superseded snapshot is reported as **evidence-only**.

Additionally (Tierward repo): scan `docs/reviews/` (gitignored, local audit history). For each dated snapshot dir/file, report staleness evidence - findings absorbed into `docs/refactoring-backlog.md` or roadmap, superseding reviews, age. **Evidence-only, never executable**, same hard rule as tracked docs but for a different reason: this history exists nowhere else - deletion is irreversible loss with no git recovery.

**Hard rule**: documentation is git-tracked content - a wrong call here is real, hard-to-reverse loss, a different risk class than a git branch or a local session file. Never include a doc-orphan finding in the Step 5 confirmation batch, never suggest a deletion command for it, regardless of how confident the evidence looks. State this limitation explicitly in the report so it doesn't read as an oversight.

## Step 4 - Report

Present findings grouped by category, each with its evidence. For branches/worktrees/session files: include the exact command that would run. For doc orphans: evidence only, explicitly labeled "not included in execution - human judgment required."

## Step 5 - Confirm (AskUserQuestion)

One batched question (or a small set): list the exact items proposed for deletion, grouped, with an option to execute all / execute a subset / cancel. Initiatives candidates state their proposed action per item (archive vs delete). `ORPHAN_WORKTREE_DIR` items are NEVER part of the batch: each gets its own dedicated confirmation, with the content summary restated. Do not include doc-orphan or docs/reviews findings in this gate - they were never candidates for execution.

## Step 6 - Execute confirmed items only

- Branches: `git branch -d <name>`
- Worktrees: `git worktree remove <path>`
- Prunable worktree registrations: `git worktree prune`
- Session files: `rm .claude/session/<file>.md` - only for items the user explicitly confirmed, one at a time, never a bulk `rm .claude/session/*.md`.
- Initiatives: `rm .claude/initiatives/<file>.md` (delete) or `mkdir -p docs/reviews/archive && mv .claude/initiatives/<file>.md docs/reviews/archive/` (archive) - one at a time, per the action confirmed for that item. Never touch `roadmap-status.md`.
- Orphan worktree dirs: `rm -rf .claude/worktrees/<dir>` - only after that item's own dedicated confirmation.

If any command refuses (unmerged branch, dirty worktree), stop and report - do not force.

## Step 7 - Summary

One line per category: found / confirmed / executed / left for later (docs). If nothing was found in a category, say so plainly rather than omitting the section - a clean report is a valid, useful outcome.
