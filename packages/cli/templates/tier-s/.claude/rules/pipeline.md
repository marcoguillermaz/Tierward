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
  - If one exists: read it - a previous fix session was interrupted. Resume from it. Do NOT create a new file.
  - If none: create `.claude/session/fix-[description].md` with a one-line description and the current date.
- Confirm current branch starts with `fix/`. If not: `git checkout -b fix/description`.
- Never commit directly to `main` or `staging`.
- **Escalation check**: if the fix touches a shared utility or type with >5 import consumers (or the equivalent in the project's language — Go `pkg/`, Swift shared framework, Python package imports), stop - notify the user and escalate to Tier M (full pipeline). A fix with wide-impact shared changes is not a fast-lane operation.

## FL-1 - Implement

- **Scope confirmation (compact)**: before writing any code, state the exact files to modify, the specific change in each, and flag any irreversible operation.

***** STOP - wait for an execution keyword (`Execute` · `Proceed` · `Confirmed` · `Go ahead`) before writing any code. *****
- **Bugs encountered during the fix**: if a test failure or unexpected behavior surfaces while writing, invoke `/systematic-debugging` before proposing or applying any change.
- Write the fix. No dependency scan (unless a shared utility is touched - then do a quick grep).
- Run type check: `[TYPE_CHECK_COMMAND]`
- Run tests: `[TEST_COMMAND]`
- Both must be green before committing.
- Commit: `git add … && git commit -m "fix(scope): description"`
- No intermediate docs update unless `CLAUDE.md` genuinely needs a pattern correction.

## FL-2 - Deploy to staging + smoke test

- Merge to staging: `git checkout staging && git merge fix/description --no-ff && git push origin staging`
- Wait for deploy (~1–2 min). Verify in 1–3 steps.
- If broken: fix on the `fix/` branch, re-merge.

## FL-3 - Promote to production

- Merge to main: `git checkout main && git merge staging --no-ff && git push origin main`
- Verify deploy completes.
- Output a one-line summary: `fix complete ✅ - [description] · type check ✅ · tests N/N ✅`

## FL-4 - Cleanup

- Update `docs/implementation-checklist.md` only if the fix closes a tracked item (if the file exists).
- Update `CLAUDE.md` only if the fix reveals a non-obvious pattern worth documenting.
- **Delete session file**: remove `.claude/session/fix-[description].md`.
  - Proceed only if the fix is confirmed working in production.
  - If outcome is ambiguous: ask explicitly before deleting.
- Delete local fix branch: `git branch -d fix/description`
- Output a one-line summary: `fix complete ✅ - [description] · type check ✅ · tests N/N ✅`

> Fast Lane has one compact scope-confirm gate in FL-1. Escalate to Tier M or Tier L if:
> scope expands beyond 3 files, a migration is required, or a shared utility with >5 consumers is touched.

---

## Cross-cutting rules

- **Never commit to `main` or `staging` directly.** All development on `fix/` branches.
- **Green before commit**: type check + tests must pass before every commit.
- **Conventional commits**: `fix(scope): description` - lowercase, imperative, under 72 chars.
- **No unrequested changes**: fix only what was asked. No opportunistic refactoring.
- **Secret hygiene**: never commit `.env*` files, tokens, or credentials.
