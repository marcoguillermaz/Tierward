---
name: pr-review
description: Autonomous local PR review. Fetches the PR diff via `gh`, spawns a dedicated review subagent with universal + stack-specific severity criteria, posts the review as a comment on the PR (audit trail), and asks for a merge decision. Stack-aware via sibling PATTERNS.md (node-ts, python, swift in v1; agnostic body fallback for others). Severity rules configurable via `team-settings.json` `prReviewSeverity` (Option β); hard-coded universal defaults when absent (Option α). Default model is sonnet; `--deep` escalates to opus. Skill never modifies code, never auto-merges — merge is always the user's decision.
user-invocable: true
model: sonnet
context: fork
allowed-tools: Bash(gh pr view:*) Bash(gh pr list:*) Bash(gh pr diff:*) Bash(gh pr comment:*) Bash(gh repo view:*) Bash(git branch:*) Bash(git rev-parse:*) Read Glob Grep Agent
argument-hint: [PR_NUMBER] [--deep] [--with-context]
---

Run an autonomous PR review locally. Classify findings by severity, post the review as a comment for audit trail, and surface a merge decision to the user. Read-only: the skill orchestrates a review; it does not modify code, does not push, does not merge.

## Step 0 — Resolve repo + parse args

```bash
# Detect the GitHub repo from the local clone (no hard-coded org/repo).
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
```

If `gh repo view` fails: respond `"This skill requires the gh CLI authenticated against a GitHub repo. Run \`gh auth login\` and ensure the project has a GitHub remote."` and stop.

Parse `$ARGUMENTS`:

| Arg | Behavior |
|---|---|
| `<PR_NUMBER>` (positional, optional) | Integer. If absent, detect from current branch in Step 1. |
| `--deep` | Escalate the review subagent from `sonnet` to `opus`. Use for changes touching auth, money, migrations, or shared utilities. Adds ~30-60s latency. |
| `--with-context` | Pass the active session file (`.claude/session/block-*.md` if present) to the review subagent. Default OFF — review stays diff-pure and unbiased by prior decisions. |

Examples:

- `/pr-review 122`
- `/pr-review 122 --deep`
- `/pr-review --deep` (resolves PR from current branch)

## Step 1 — Resolve PR number

If `PR_NUMBER` was passed, use it. Otherwise:

```bash
BRANCH=$(git rev-parse --abbrev-ref HEAD)
gh pr list --repo "$REPO" --head "$BRANCH" --state open --json number -q '.[0].number'
```

If empty, retry with `--state merged` to catch a recently-merged PR. If still nothing: respond `"No PR found for branch <X>. Pass a PR number explicitly: /pr-review <N>."` and stop.

## Step 2 — Fetch PR metadata + diff

```bash
gh pr view "$PR_NUMBER" --repo "$REPO" \
  --json title,state,headRefName,baseRefName,additions,deletions,changedFiles \
  > /tmp/pr-review-${PR_NUMBER}-meta.json

gh pr diff "$PR_NUMBER" --repo "$REPO" > /tmp/pr-review-${PR_NUMBER}.diff
```

If the diff is over 50 000 lines: warn the user and ask whether to proceed. A very large diff produces shallow review; default proceed but flag in the report.

## Step 3 — Load review context

Three sources, layered:

1. **Universal severity defaults** (Option α): always loaded from this SKILL.md (see "Severity criteria — universal defaults" below).
2. **Stack-specific severity additions**: load sibling `PATTERNS.md` if the project's stack matches an entry there. PATTERNS.md adds critical/major/minor patterns specific to the stack (node-ts, python, swift in v1).
3. **Project override** (Option β): if `.claude/team-settings.json` contains a `prReviewSeverity` section, its arrays override / extend the universal + stack defaults. Schema:

   ```json
   {
     "prReviewSeverity": {
       "critical": ["paths/to/auth/**", "src/migrations/**"],
       "major": ["src/api/**"],
       "minor": []
     }
   }
   ```

   File path globs marked `critical` always escalate findings on those paths; same for `major`. The `minor` array is an explicit "downgrade" list — findings in those paths default to Minor.

Also read `CLAUDE.md` (project conventions). Pass it to the subagent so project-specific intentional patterns are not flagged as issues (e.g., language conventions, framework-specific idioms, intentional service-role usage).

## Step 4 — Spawn the review subagent

Use the **Agent tool** (`subagent_type: general-purpose`). Model: `sonnet` by default, `opus` if `--deep`.

Compose the subagent prompt by substituting these placeholders into the template under "Review subagent prompt" below: `<REPO>`, `<N>`, `<TITLE>`, `<HEAD_REF>`, `<BASE_REF>`, `<DIFF_PATH>` (do NOT inline the diff content; pass the path so the subagent reads it from disk), `<META_JSON>`, `<CLAUDE_MD>`, `<STACK_PATTERNS>` (contents of PATTERNS.md or "(no stack-specific patterns for this project)"), `<TEAM_SEVERITY>` (parsed `prReviewSeverity` JSON or `null`), and `<SESSION_FILE_CONTENT>` (only if `--with-context`).

The subagent returns a structured markdown review.

## Step 5 — Post the review as a PR comment

```bash
gh pr comment "$PR_NUMBER" --repo "$REPO" --body-file /tmp/pr-review-${PR_NUMBER}-output.md
```

Always post — even on LGTM clean reviews — to maintain a permanent audit trail. The comment is the canonical record; the in-conversation summary in Step 6 is for the maintainer's terminal.

## Step 6 — Synthesize for the user

Parse the subagent output. Produce a compact in-terminal summary:

```
PR #<N> — <TITLE>
Status: CI <state> · Review model: <sonnet|opus> · Comment posted: <URL>

Critical (N)
- <file:line> — <finding> → <action>

Major (N)
- <file:line> — <finding> → <action>

Minor (N) — to append to docs/refactoring-backlog.md if user proceeds
- <one-liner>

Decision needed (default: **integrate** for a fix on this open PR): integrate fix · fix branch · proceed merge?
```

If zero Critical and zero Major: omit those sections, list Minor in ≤ 2 lines, recommend `proceed merge` directly.

## Step 7 — Wait for user decision

Three valid responses (**`integrate` is the default** for fixing findings on the PR under review):

1. **integrate** *(default)* — apply the fix in the current branch, run `/commit`, push, re-run `gh pr checks --watch`, then re-invoke `/pr-review <N>` to confirm. This is the right choice for a Critical/Major found on this PR: the fix lands on the same branch/PR.
2. **fix branch** — open `fix/<short-desc>` from the base branch, apply, full pipeline. Reference the original PR in the description. **Not for fixing this PR**: a branch cut from the base cannot contain this open PR's own changes, so it only makes sense as a deliberately deferred, decoupled follow-up (e.g. a separate refactor), never as the default for resolving a finding on the current PR.
3. **proceed** — user runs `gh pr merge` themselves. Append unresolved Minor findings to `docs/refactoring-backlog.md` with the appropriate ID prefix (`PERF-`, `DEV-`, `SEC-`, `DB-`, `A-`, `S-`, `T-`, `N-`).

Never call `gh pr merge` from this skill — merge is always the user's decision. The pipeline.md Phase 8 (Tier M/L) or FL-2 (Tier S) is the canonical merge location, and it's a human gate.

---

## Severity criteria — universal defaults (Option α)

These apply to any project. PATTERNS.md (when present for the detected stack) adds stack-specific entries. `team-settings.json` `prReviewSeverity` (when present) overrides + extends.

### Critical — blocks merge

- Missing auth/authz check in an API route or RPC handler before mutating data
- Secret / token leaked in response body, error message, log line, or test fixture
- Direct SQL or shell injection vector (raw user input → query string / shell argument)
- User input written to a persistent store without runtime validation on a write path
- Cross-tenant / cross-user data leak (entity A's record returned to user B)
- Hard-coded credentials in source (`password = "..."`, `apiKey = "..."`)
- A migration that drops / renames a column without a documented rollback path
- Privileged client (admin / service role / sudo) used in a context that should not have privilege
- Authentication state ignored or bypassed (unsigned JWT accepted, expired token honored)

### Major — should be resolved before merge

- API route missing input validation on a write path
- Race condition / TOCTOU on a mutating path
- Error path silently swallowed (`catch {}`) where the error should be reported / logged / surfaced
- Type unsafety on a production path (`as any`, unsafe cast on data from external source without runtime validation)
- Unbounded query / pagination missing on a list endpoint
- N+1 query pattern on a request-handling path
- New persistent table without access-control policy declaration
- Console / debugger / TODO / FIXME / `@ts-ignore` / similar suppression left in committed code
- An async fire-and-forget without a `.catch()` that should report
- Test asserts state synchronously where a wait-for-condition is required (flake)

### Minor — append to refactoring backlog

- Naming inconsistency, comment typo, doc gap
- Opportunistic refactor that could simplify but isn't broken
- Unused import, unused variable, dead code
- Stylistic preference (variable name length, ordering)
- Minor performance pitfall on a cold path

---

## Review subagent prompt (template)

Pass this prompt verbatim to the review subagent in Step 4. Substitute the bracketed placeholders. The subagent has read access only — it must NOT post the comment, edit files, or run any mutation command. That is the orchestrator's job.

```
You are an autonomous code reviewer for a pull request on the <REPO> repository. Your output goes verbatim into a comment on the PR — write it as a markdown review.

## PR metadata
- Repo: <REPO>
- Number: #<N>
- Title: <TITLE>
- Branch: <HEAD_REF> → <BASE_REF>
- Diff path: <DIFF_PATH>
- Stats: <META_JSON>

## Project conventions (from CLAUDE.md — do NOT flag these as issues)
<CLAUDE_MD>

## Severity criteria

### Universal (always apply)
[Insert "Severity criteria — universal defaults" section verbatim from SKILL.md]

### Stack-specific additions
<STACK_PATTERNS>

### Project overrides
<TEAM_SEVERITY>

## Output format — MANDATORY

Produce a single markdown document. This is what gets posted as a PR comment.

```markdown
## /pr-review — autonomous local review

**PR**: #<N> — <TITLE>
**Branch**: `<HEAD_REF>` → `<BASE_REF>`
**Stats**: +<additions> −<deletions> across <changedFiles> files
**Model**: <sonnet|opus>

### Verdict
<one of: ✅ LGTM clean — safe to merge | ⚠ Findings present — see below | 🛑 BLOCKING issues — do not merge>

### Critical (N)
<numbered list: file path:line, finding in 1-2 sentences, recommended action. If N=0, write "None.">

### Major (N)
<same format. If N=0, write "None.">

### Minor (N)
<one-line bullets. If N=0, write "None.">

### Notes
<optional, ≤3 sentences: context useful for the merger that doesn't fit above>

---
*Generated locally by `/pr-review` skill (<ISO timestamp>)*
```

## Constraints

- Be conservative: if you're not sure something is a problem, surface it in Notes, not as Critical/Major.
- Cite line numbers from the diff when possible (the diff has `+`/`-` line markers).
- Never invent issues to fill quota — "0 findings" is a valid output.
- Length cap: total output ≤ 200 lines. If the diff is enormous, summarize patterns rather than enumerating every nit.
- You may grep / read project files to verify a concern, but do NOT edit anything.
- You must NOT call `gh pr comment`. Return the markdown report only.
- If `<SESSION_FILE_CONTENT>` is provided: use it to understand architectural decisions made during the block, but do NOT defer to it on security/correctness findings. Your job is to spot issues the implementer may have rationalized away.
```

---

## Hard rules

- **Never call `gh pr merge`**. Merge is the user's decision; this skill only reviews.
- **Never modify code**. The subagent has read-only access; the orchestrator never patches.
- **Always post the comment**. Even on LGTM clean reviews — the audit trail is the value.
- **Never trust `--with-context` to absolve findings**. Session context informs the review; it does not override security or correctness signals.
- **Never paste 50 000-line diffs into the subagent prompt**. Pass the path; the subagent reads from disk.

## Out of scope (v1)

- CI workflow that auto-runs `/pr-review` on every PR. Defer to v2 once observed adoption signal supports it.
- Auto-merging based on the review verdict. Always human-in-the-loop.
- Multi-language reviewer comments. English only in v1.
- Streaming the review back to the user as it's generated. v1 returns the full report once.

## Stack adaptation

PATTERNS.md (sibling file) provides per-stack severity additions for the top 3 stacks in v1: node-ts, python, swift. Other stacks fall back to the universal defaults in this body. PATTERNS.md is loaded conditionally only when the detected stack matches one of the documented entries.
