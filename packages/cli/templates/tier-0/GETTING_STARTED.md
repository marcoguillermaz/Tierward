# Getting Started with Claude Code

Welcome to your first session with Claude Code. This guide covers the essentials in five steps.

---

## What Claude Code is

Claude Code is an AI assistant that reads and writes code directly in your terminal. It has full
access to your project: it can read files, run commands, check errors, and make changes across the
entire codebase in a single session.

**One constraint is already wired in**: Claude cannot tell you a task is complete unless your tests
pass. This is enforced automatically by `.claude/settings.json`. If tests fail, Claude will try to
fix them before declaring done.

---

## Step 1 - Open Claude Code

From your project root:

```bash
claude
```

Claude reads `CLAUDE.md` at startup. That file tells it your stack, your commands, and any
project-specific rules. Keep it under 200 lines - Claude loads the whole thing on every session.

---

## Step 2 - Tell Claude what to do

Describe your task in plain language. You don't need special commands for most things:

```
Add a /health endpoint that returns { status: "ok" } with HTTP 200.
```

```
The login form doesn't clear the password field after a failed attempt. Fix it.
```

```
Refactor the user service to separate the DB queries from the business logic.
```

Claude will ask clarifying questions if the task is ambiguous. Answer them and it will proceed.

---

## Step 3 - Review the changes

Claude shows you every file it plans to change before writing. You can:
- **Approve** individual edits
- **Reject** and ask for a different approach
- **Ask questions** about why it made a particular choice

Good habit: run your tests yourself after Claude finishes, even though the Stop hook does it too.

---

## Step 4 - Teach Claude about your project

The more Claude knows about your project, the better its suggestions. After any session where it
discovers something non-obvious, add it to `CLAUDE.md`:

```markdown
## Known Patterns
- Auth token is stored in a cookie named `__session`, not `Authorization` header
- All API errors follow the shape `{ error: { code, message } }`
- Use `createError()` in `lib/errors.ts` - never throw raw exceptions
```

These notes persist across sessions. Claude reads them every time.

---

## Step 5 - When you're ready for more structure

Tier 0 (what you have now) gives you the minimum viable scaffold:
- Claude knows your project via `CLAUDE.md`
- Tests must pass before Claude declares a task complete
- Claude follows a small set of communication rules (`output-style.md`)

When your team grows or your project complexity increases, promote to a higher tier by re-running `init` and choosing **"Existing project"** when prompted:

```bash
npx tierward init --tier=s   # Fast Lane: branch discipline + commit rules
npx tierward init --tier=m   # Standard: phased pipeline with review gates
npx tierward init --tier=l   # Full: audit skills, security review, multi-agent
```

Re-running `init` in-place is non-destructive - it adds the new tier's files without overwriting your existing ones (`CLAUDE.md`, `settings.json`, and any customizations are preserved).

---

## Quick reference

| What you want | How to do it |
|---|---|
| Start a session | `claude` from project root |
| Give Claude context | Edit `CLAUDE.md` |
| Run tests manually | `[TEST_COMMAND]` |
| See what Claude can do | Ask: "What slash commands are available?" |
| Add more structure | `npx tierward init --tier=s` (choose "Existing project") |

---

*Remove this file once your team is comfortable with Claude Code. It's only needed at the start.*
