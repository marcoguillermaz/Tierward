---
name: pr-review
description: Autonomous local code review. Reviews either an open PR's diff (via `gh`) or the local working diff against a base branch (`--local`, auto-selected when no PR exists yet), spawns a dedicated review subagent with universal + stack-specific severity criteria, posts the review as a comment on the PR (audit trail; skipped in local mode), and asks for a decision. Stack-aware via sibling PATTERNS.md (node-ts, python, swift in v1; agnostic body fallback for others). Severity rules configurable via `team-settings.json` `prReviewSeverity` (Option β); hard-coded universal defaults when absent (Option α). Default model is sonnet; `--deep` escalates to opus. Skill never modifies code, never auto-merges — merge is always the user's decision.
user-invocable: true
model: sonnet
context: fork
allowed-tools: Bash(gh pr view:*) Bash(gh pr list:*) Bash(gh pr diff:*) Bash(gh pr comment:*) Bash(gh repo view:*) Bash(git branch:*) Bash(git rev-parse:*) Bash(git diff:*) Bash(git merge-base:*) Read Glob Grep Agent
argument-hint: [PR_NUMBER] [--local] [--base <branch>] [--deep] [--with-context]
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
| `--local` | Review the local working diff (`git diff <base>...HEAD`) instead of a PR. Use before the PR exists to catch findings pre-push. **Auto-selected** in Step 1 when no PR is found for the branch, so an explicit flag is only needed to force local mode while an open PR also exists. |
| `--base <branch>` | Base branch for `--local` diff (default: the repo's default branch, resolved in Step 1). Ignored in PR mode (the PR carries its own base). |
| `--deep` | Escalate the review subagent from `sonnet` to `opus`. Use for changes touching auth, money, migrations, or shared utilities. Adds ~30-60s latency. |
| `--with-context` | Pass the active session file (`.claude/session/block-*.md` if present) to the review subagent. Default OFF — review stays diff-pure and unbiased by prior decisions. |

Examples:

- `/pr-review 122`
- `/pr-review 122 --deep`
- `/pr-review --deep` (resolves PR from current branch; falls back to local diff if none open)
- `/pr-review --local` (review the working diff against the default base, before opening a PR)
- `/pr-review --local --base staging`

## Step 1 — Resolve PR number, or select local-diff mode

**Mode selection:**

- If `--local` was passed → **local mode** (skip PR resolution entirely).
- Else if `PR_NUMBER` was passed → **PR mode** with that number.
- Else detect a PR for the current branch:

  ```bash
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  gh pr list --repo "$REPO" --head "$BRANCH" --state open --json number -q '.[0].number'
  ```

  If empty, retry with `--state merged` to catch a recently-merged PR. If a number is found → **PR mode**. If still nothing → **auto-fall back to local mode** (do NOT stop): there is no PR yet, so review the local diff. Announce: `No open PR for branch <X> — reviewing the local diff instead (run again after opening the PR for the audit-trail comment).`

**Local mode — resolve the base branch and confirm there is a diff:**

```bash
BRANCH=$(git rev-parse --abbrev-ref HEAD)
# --base <branch> if given; otherwise the repo default branch.
BASE="${BASE_ARG:-$(gh repo view --repo "$REPO" --json defaultBranchRef -q .defaultBranchRef.name)}"
git rev-parse --verify "$BASE" >/dev/null 2>&1 || BASE="origin/$BASE"
git merge-base --is-ancestor "$BASE" HEAD 2>/dev/null; git rev-list --count "$BASE...HEAD"
```

If the branch IS the base branch, or `git diff "$BASE"...HEAD` is empty: respond `"No local changes vs <BASE> to review. Commit or stage work first, or pass --base <branch>."` and stop. The diff uses three-dot `<BASE>...HEAD` (changes introduced on HEAD since it diverged from base) — the same set a PR against `<BASE>` would show.

## Step 2 — Fetch metadata + diff

**PR mode:**

```bash
gh pr view "$PR_NUMBER" --repo "$REPO" \
  --json title,state,headRefName,baseRefName,additions,deletions,changedFiles \
  > /tmp/pr-review-${PR_NUMBER}-meta.json

gh pr diff "$PR_NUMBER" --repo "$REPO" > /tmp/pr-review-${PR_NUMBER}.diff
```

**Local mode** (no PR number — key the temp files off the branch name):

```bash
SLUG=$(echo "$BRANCH" | tr '/' '-')
git diff "$BASE"...HEAD > /tmp/pr-review-local-${SLUG}.diff
git diff "$BASE"...HEAD --stat | tail -1        # summary line for the stats field
```

Build the metadata fields from git rather than `gh pr view`: `title` = latest commit subject (`git log -1 --format=%s`), `state` = `LOCAL (no PR yet)`, `headRefName` = `$BRANCH`, `baseRefName` = `$BASE`, additions/deletions/changedFiles from `git diff "$BASE"...HEAD --shortstat`.

In both modes, `<DIFF_PATH>` is the file written above.

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

**PR mode — reuse a same-commit pre-PR review (confirmatory short-circuit).** Before spawning, check whether a local pre-PR review already covers this exact commit *and* base:

```bash
read -r PR_HEAD_SHA HEAD_REF PR_BASE < <(gh pr view "$PR_NUMBER" --repo "$REPO" \
  --json headRefOid,headRefName,baseRefName -q '"\(.headRefOid) \(.headRefName) \(.baseRefName)"')
SLUG=$(echo "$HEAD_REF" | tr '/' '-')
LOCAL_REPORT=/tmp/pr-review-local-${SLUG}-output.md

# Read provenance from the HEADER BLOCK ONLY (the first lines, up to the blank line that
# closes it) — never a body/diff line that happens to quote "Reviewed-SHA:". `sed` quits at
# the first blank line, and `^Reviewed-…:` is anchored to the line start.
if [ -f "$LOCAL_REPORT" ]; then
  REVIEWED_SHA=$(sed -n '/^$/q; s/^Reviewed-SHA: *//p'   "$LOCAL_REPORT")
  REVIEWED_BASE=$(sed -n '/^$/q; s/^Reviewed-Base: *//p'  "$LOCAL_REPORT")
  REVIEWED_MODEL=$(sed -n '/^$/q; s/^Reviewed-Model: *//p' "$LOCAL_REPORT")
fi
```

Reuse the local report (skip the subagent) **only when all** of these hold:
- `$LOCAL_REPORT` exists and `$REVIEWED_SHA` == `$PR_HEAD_SHA` (head unchanged since the local pass);
- `$REVIEWED_BASE` == `$PR_BASE` (same three-dot diff scope — a local review taken against a different base covers a different change set and must not be reused);
- the report has **zero Critical and zero Major** findings — key the skip on the finding *counts*, never on the verdict line: a soft or mis-generated `✅ LGTM` that still carries a Major must **not** ride the skip (count the entries under the report's `### Critical (N)` / `### Major (N)` sections; `N=0` on both is the only pass);
- the current invocation is **not** `--deep`, unless `$REVIEWED_MODEL` is already `opus` (an explicit deep request is never satisfied by a shallower pass).

When all hold, write the reused body to the PR output path with a reuse banner prepended, carry the local report's verdict to Step 6, and **skip the rest of Step 4**:

```bash
{ printf '> Reused from same-commit pre-PR local review — second review run skipped (head and base unchanged since the local pass).\n\n'; cat "$LOCAL_REPORT"; } \
  > /tmp/pr-review-${PR_NUMBER}-output.md
```

Otherwise **re-review** (spawn below). This is the conservative default: no local report, a `Reviewed-SHA`/`Reviewed-Base` mismatch, a Critical/Major in the local report, a `--deep` request against a shallow report, or a maintainer choosing a fresh pass after seeing CI at Step 7 — all lead here. The skill does not query CI status itself; that judgment is the maintainer's at Step 7.

Use the **Agent tool** (`subagent_type: general-purpose`). Model: `sonnet` by default, `opus` if `--deep`.

Compose the subagent prompt by substituting these placeholders into the template under "Review subagent prompt" below: `<REPO>`, `<N>`, `<TITLE>`, `<HEAD_REF>`, `<BASE_REF>`, `<DIFF_PATH>` (do NOT inline the diff content; pass the path so the subagent reads it from disk), `<META_JSON>`, `<CLAUDE_MD>`, `<STACK_PATTERNS>` (contents of PATTERNS.md or "(no stack-specific patterns for this project)"), `<TEAM_SEVERITY>` (parsed `prReviewSeverity` JSON or `null`), and `<SESSION_FILE_CONTENT>` (only if `--with-context`).

The subagent returns a structured markdown review.

## Step 5 — Post the review as a PR comment

**PR mode:**

```bash
gh pr comment "$PR_NUMBER" --repo "$REPO" --body-file /tmp/pr-review-${PR_NUMBER}-output.md
```

Always post — even on LGTM clean reviews, and even on the Step 4 reuse path — to maintain a permanent audit trail. Reuse skips the *second review run*, never this comment: it posts the reused report written to the same `/tmp/pr-review-${PR_NUMBER}-output.md` path. The comment is the canonical record; the in-conversation summary in Step 6 is for the maintainer's terminal.

**Local mode:** there is no PR to comment on, so skip `gh pr comment`. Write the report to `/tmp/pr-review-local-${SLUG}-output.md`, then prepend a provenance header so a later PR-mode run can safely detect a same-commit pre-PR review:

```bash
{
  printf 'Reviewed-SHA: %s\n'  "$(git rev-parse HEAD)"
  printf 'Reviewed-Base: %s\n' "${BASE#origin/}"      # normalized: strip origin/ so it matches a PR's baseRefName
  printf 'Reviewed-Model: <sonnet|opus>\n\n'          # the model chosen in Step 4 (opus when --deep)
  cat /tmp/pr-review-local-${SLUG}-output.md
} > /tmp/pr-review-local-${SLUG}-output.md.tmp \
  && mv /tmp/pr-review-local-${SLUG}-output.md.tmp /tmp/pr-review-local-${SLUG}-output.md
```

Tell the user the audit-trail comment is **deferred** — re-run `/pr-review <N>` once the PR is open to post the canonical record. The local pass is a pre-push gate, not the audit trail; the provenance header lets the PR-mode run reuse this review only if the PR's head commit **and** base branch both match (see Step 4).

## Step 6 — Synthesize for the user

Parse the subagent output. Produce a compact in-terminal summary.

**PR mode:**

```
PR #<N> — <TITLE>
Status: CI <state> · Review model: <sonnet|opus, or "reused (same-commit pre-PR)"> · Comment posted: <URL>

Critical (N)
- <file:line> — <finding> → <action>

Major (N)
- <file:line> — <finding> → <action>

Minor (N) — to append to docs/refactoring-backlog.md if user proceeds
- <one-liner>

Decision needed (default: **integrate** for a fix on this open PR): integrate fix · fix branch · proceed merge?
```

If zero Critical and zero Major: omit those sections, list Minor in ≤ 2 lines, recommend `proceed merge` directly.

**Local mode:** replace the header with `Local review — branch <BRANCH> vs <BASE> · Review model: <sonnet|opus> · Comment: deferred until PR opens`. Keep the Critical/Major/Minor sections identical. Replace the decision line with `Decision needed (default: **fix** before opening the PR): fix now · open PR as-is?` — see Step 7.

## Step 7 — Wait for user decision

Three valid responses (**`integrate` is the default** for fixing findings on the PR under review):

1. **integrate** *(default)* — apply the fix in the current branch, run `/commit`, push, re-run `gh pr checks --watch`, then re-invoke `/pr-review <N>` to confirm. This is the right choice for a Critical/Major found on this PR: the fix lands on the same branch/PR.
2. **fix branch** — open `fix/<short-desc>` from the base branch, apply, full pipeline. Reference the original PR in the description. **Not for fixing this PR**: a branch cut from the base cannot contain this open PR's own changes, so it only makes sense as a deliberately deferred, decoupled follow-up (e.g. a separate refactor), never as the default for resolving a finding on the current PR.
3. **proceed** — user runs `gh pr merge` themselves. Persist unresolved Minor findings via the backlog write-once protocol (`.claude/rules/backlog-protocol.md`) — session scratch in an active block, direct to `docs/refactoring-backlog.md` standalone — with the appropriate ID prefix (`PERF-`, `DEV-`, `SEC-`, `DB-`, `A-`, `S-`, `T-`, `N-`).

**Local mode** — no PR exists yet, so the choice is whether to fix before opening it:

1. **fix** *(default)* — apply the fix on the current branch, run `/commit`. No push/PR round-trip is spent on the finding. This is the whole point of the local pass: resolve Critical/Major *before* CI and reviewers see the PR.
2. **open PR as-is** — the user opens the PR themselves; unresolved Minor findings are persisted via the backlog write-once protocol (`.claude/rules/backlog-protocol.md`; session scratch in a block, direct standalone) with the appropriate ID prefix. Re-run `/pr-review <N>` after the PR opens to post the audit-trail comment.

Never open, push, or merge from this skill in either mode — those are the user's actions. The canonical merge gate stays pipeline.md Phase 8 (Tier M/L) or FL-2 (Tier S).

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
- **Always post the comment in PR mode**. Even on LGTM clean reviews — the audit trail is the value. Local mode has no PR to comment on: it writes the report to disk and defers the canonical comment to the later PR-mode pass.
- **Reuse only a same-commit, same-base pre-PR review**. The Step 4 short-circuit skips the second review run only when head SHA and base branch both match and no Critical/Major was found; it still posts the audit-trail comment, and it never reuses across a moved HEAD, a different base, or an explicit `--deep` request.
- **Never trust `--with-context` to absolve findings**. Session context informs the review; it does not override security or correctness signals.
- **Never paste 50 000-line diffs into the subagent prompt**. Pass the path; the subagent reads from disk.

## Out of scope (v1)

- CI workflow that auto-runs `/pr-review` on every PR. Defer to v2 once observed adoption signal supports it.
- Auto-merging based on the review verdict. Always human-in-the-loop.
- Multi-language reviewer comments. English only in v1.
- Streaming the review back to the user as it's generated. v1 returns the full report once.

## Stack adaptation

PATTERNS.md (sibling file) provides per-stack severity additions for the top 3 stacks in v1: node-ts, python, swift. Other stacks fall back to the universal defaults in this body. PATTERNS.md is loaded conditionally only when the detected stack matches one of the documented entries.
