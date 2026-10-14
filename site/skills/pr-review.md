# /pr-review

> Autonomous local code review. Reviews either an open PR's diff (via `gh`) or the local working diff against a base branch (`--local`, auto-selected when no PR exists yet), spawns a dedicated review subagent with universal + stack-specific severity criteria, posts the review as a comment on the PR (audit trail; skipped in local mode), and asks for a decision. Stack-aware via sibling PATTERNS.md (node-ts, python, swift in v1; agnostic body fallback for others). Severity rules configurable via `team-settings.json` `prReviewSeverity` (Option β); hard-coded universal defaults when absent (Option α). Default model is sonnet; `--deep` escalates to opus. Skill never modifies code, never auto-merges — merge is always the user's decision.

| Tiers | Model | Flags |
|---|---|---|
| Tier M · Tier L | Sonnet | `[PR_NUMBER] [--local] [--base <branch>] [--deep] [--with-context]` |

---

## When to use

Run after pushing a branch and opening a PR, or on any PR awaiting review when human reviewer bandwidth is limited. Before the push, run it with `--local` (chosen on its own when the branch has no PR yet) to review the working diff against the base branch; `--base <branch>` picks a different base. The `--deep` flag escalates analysis to Opus for PRs with complex logic changes, migrations, or security-sensitive code.

## Expected output

Findings posted as a PR comment via the gh CLI, grouped by severity with file links and line references. A typical comment: a missing null check on an optional field that is accessed before validation, with the exact line flagged and a suggested guard clause. In local mode the same report is saved under `.tierward/tmp/` with a provenance header (commit, base, model that ran), and a later PR-mode run on the same commit and base reuses it instead of reviewing twice.
