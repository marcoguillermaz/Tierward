# /pr-review

> Autonomous local PR review. Fetches the PR diff via `gh`, spawns a dedicated review subagent with universal + stack-specific severity criteria, posts the review as a comment on the PR (audit trail), and asks for a merge decision. Stack-aware via sibling PATTERNS.md (node-ts, python, swift in v1; agnostic body fallback for others). Severity rules configurable via `team-settings.json` `prReviewSeverity` (Option β); hard-coded universal defaults when absent (Option α). Default model is sonnet; `--deep` escalates to opus. Skill never modifies code, never auto-merges — merge is always the user's decision.

| Tiers | Model | Flags |
|---|---|---|
| Tier M · Tier L | Sonnet | `[PR_NUMBER] [--deep] [--with-context]` |

---

## Dove e quando

Run after pushing a branch and opening a PR, or on any PR awaiting review when human reviewer bandwidth is limited. The `--deep` flag escalates analysis to Opus for PRs with complex logic changes, migrations, or security-sensitive code.

## Output atteso

Findings posted as a PR comment via the gh CLI, grouped by severity with file links and line references. A typical comment: a missing null check on an optional field that is accessed before validation, with the exact line flagged and a suggested guard clause.
