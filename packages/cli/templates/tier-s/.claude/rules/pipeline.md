# Fast Lane Pipeline

Use for: low blast radius tasks - single dev, reversible in minutes, no shared system impact. No migrations, no new patterns, no shared type changes.
Branch prefix `fix/` activates this pipeline automatically.

---

## Placeholder behavior

When a command placeholder in `CLAUDE.md` (type-check, build, test, E2E, or dev-server command) has no configured value (absent or left as a comment placeholder):
- Emit a visible step: `[SKIP] No <command-name> configured for this stack — verify manually if applicable.`
- Do NOT proceed as if the command succeeded.
- Do NOT mark the gate green.

A skip is a legitimate outcome. Silent degradation is not.

---

## FL-0 - Branch check + session file

- **Session file**: check `.claude/session/` for existing `fix-*.md` files.
  - If one exists: read it - a previous fix session was interrupted. Resume from it. Do NOT create a new file. Exception: if its front matter contains `fix_closed: true`, the fix was closed and the file kept on purpose at the cleanup gate - treat it as archive, do not resume, create a new file.
  - If none: create `.claude/session/fix-[description].md` starting with this machine-readable front matter (Tierward hooks read it — keep the keys exact), followed by a one-line description and the current date:

    ```
    ---
    fix: [description]
    requirements_approved: false
    ---
    ```
- Confirm current branch starts with `fix/`. If not: `git checkout -b fix/description`.
- Never commit directly to `main` or `staging`.
- **Escalation check**: if the fix touches a shared utility or type with >5 import consumers (or the equivalent in the project's language — Go `pkg/`, Swift shared framework, Python package imports), stop - notify the user and escalate to Tier M (full pipeline). A fix with wide-impact shared changes is not a fast-lane operation.

## FL-1 - Implement

- **Scope confirmation (compact)**: before writing any code, state the exact files to modify, the specific change in each, and flag any irreversible operation.

***** STOP — Scope confirmation *****
- WHY we stopped: approving here authorizes the whole fix implementation (code, type check, tests, commit) - there is no further gate until the staging promotion.
- WHAT to do: review the file list and the change description above; flag anything missing or any irreversible operation.
- NEXT after action: reply with a bare execution keyword (`Execute` · `Proceed` · `Confirmed` · `Go ahead`) and implementation starts; reply with anything else to adjust scope first.
*****
- **Bugs encountered during the fix**: if a test failure or unexpected behavior surfaces while writing, invoke `/systematic-debugging` before proposing or applying any change.
- Write the fix. No dependency scan (unless a shared utility is touched - then do a quick grep).
- Run type check: `[TYPE_CHECK_COMMAND]`
- Run tests: `[TEST_COMMAND]`
- Both must be green before committing.
- Commit: `git add … && git commit -m "fix(scope): description"`
- No intermediate docs update unless `CLAUDE.md` genuinely needs a pattern correction.

## FL-2 - Deploy to staging + smoke test

***** STOP — Promotion authorization (staging) *****
- WHY we stopped: the next command writes to the protected `staging` branch and deploys the fix to the staging environment. The FL-1 keyword authorized implementation only - no prior approval covers a promotion push.
- WHAT to do: confirm you want exactly this to run: `git checkout staging && git merge fix/description --no-ff && git push origin staging`. If no staging branch or remote is configured for this project: state `[SKIP] no staging target — promotion gate not applicable`, do not invent a target, and do not mark the gate passed.
- NEXT after action: reply with the bare keyword `Promote` to authorize this ONE push; the merge+push runs, then the smoke test below.
*****

- Merge to staging: `git checkout staging && git merge fix/description --no-ff && git push origin staging`
- Wait for deploy (~1–2 min). Verify in 1–3 steps.
- If broken: fix on the `fix/` branch, re-merge - re-merging repeats the Promotion authorization gate above (each authorization covers one push).

## FL-3 - Promote to production

***** STOP — Promotion authorization (production) *****
- WHY we stopped: the next command writes to the protected `main` branch and ships the fix to production. The staging authorization does not cover production - each protected branch gets its own gate.
- WHAT to do: confirm you want exactly this to run: `git checkout main && git merge staging --no-ff && git push origin main`.
- NEXT after action: reply with the bare keyword `Promote` to authorize this ONE push; the merge+push runs, deploy is verified, then FL-4 cleanup closes the pipeline.
*****

- Merge to main: `git checkout main && git merge staging --no-ff && git push origin main`
- Verify deploy completes.

## FL-4 - Cleanup

- Update `docs/implementation-checklist.md` only if the fix closes a tracked item (if the file exists).
- Update `CLAUDE.md` only if the fix reveals a non-obvious pattern worth documenting.
- If the fix touched **state transitions, role permissions, or routes**, update the matching doc (contract / RBAC table / sitemap) - or explicitly state no doc impact. Zero cost when inapplicable; prevents silent Fast-Lane doc drift.
- **Cleanup gate** (mandatory - no removal happens outside it):

***** STOP — Cleanup confirmation *****
- WHY we stopped: files and branches are about to be removed; removal is never bundled into a previous approval, and the session file should go only if the fix is confirmed working in production.
- WHAT to do: review the full candidate list presented - `.claude/session/fix-[description].md`, the local `fix/description` branch, and any screenshots or temporary artifacts generated during the fix (enumerate them from `git status --porcelain` untracked leftovers; an empty scan must be stated, not assumed).
- NEXT after action: confirm the list (or name what to keep) and only the approved items are deleted; then the closing recap ends the pipeline. If the session file is kept, `fix_closed: true` is added to its front matter so the next session does not resume it as interrupted.
*****

- Delete only the approved items (session file, `git branch -d fix/description`, artifacts).
- **Mandatory closing recap** - never skip it, even for a one-line fix:

```
**Fix complete ✅ - [description]**
- Implemented: [one-line summary]
- Checks: type check ✅ · tests N/N ✅ · staging ✅ · production ✅
- Cleanup: [removed: …] [kept: … or "nothing kept"]
- Pipeline complete - nothing further runs. Next: [follow-up item, or "none"].
```

> Fast Lane has four gates: scope confirmation (FL-1), promotion authorization to staging (FL-2) and to production (FL-3), and cleanup confirmation (FL-4). Escalate to Tier M or Tier L if:
> scope expands beyond 3 files, a migration is required, or a shared utility with >5 consumers is touched.

---

## Cross-cutting rules

- **Never commit to `main` or `staging` directly.** All development on `fix/` branches. The only sanctioned writes to these branches are this pipeline's merge-promotions (FL-2, FL-3), each behind its own Promotion authorization gate.
- **Promotion is never automatic**: any `git push` to `origin staging` or `origin main`, from any step and for any reason (first merge, re-merge after a failed smoke test, anything else), requires its own Promotion authorization gate answered with the bare keyword `Promote`. No prior approval - FL-1 keyword included - covers a promotion. `Promote` authorizes one push only and is not a general execution keyword.
- **Green before commit**: type check + tests must pass before every commit.
- **Conventional commits**: `fix(scope): description` - lowercase, imperative, under 72 chars.
- **No unrequested changes**: fix only what was asked. No opportunistic refactoring.
- **Secret hygiene**: never commit `.env*` files, tokens, or credentials.
