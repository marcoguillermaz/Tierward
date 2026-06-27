# Context Discovery - New Project

**Status**: `PENDING_DISCOVERY`

> Claude: read this file at the start of every session until Status is `COMPLETE`.
> When Status is `PENDING_DISCOVERY`, execute the Discovery Workflow below **before any other work**.

---

## Project

`[PROJECT_NAME]`

## The idea

[PROJECT_DESCRIPTION]

> This is a new (greenfield) project — there is no existing codebase to import.
> Discovery here means turning the idea above into a concrete, buildable starting
> point: a stack decision, the first development block, and populated project files.

---

## Discovery Workflow

Execute these steps **in order** before any development work. This is a one-time setup pass.

### Step 1 - Understand the idea

1. Read "The idea" above. If a longer brief exists in the project directory (e.g. a
   `README.md`, an `IDEA.md`, a spec, or notes), read it too.
2. Scan the project directory (1–2 levels deep) for anything already present —
   most greenfield projects start nearly empty, but check for partial scaffolding,
   a chosen framework, or config files that imply decisions already made.
3. Identify what the idea implies about:
   - **Product shape**: who uses it, the core jobs it does, the smallest version worth building
   - **Stack signals**: anything in the idea or directory that points to a language/framework
   - **Data**: what the product stores, and where (local, database, none)
   - **Surface**: CLI, web frontend, API, native — or a mix

### Step 2 - Resolve the stack (if not already decided)

If the tech stack is not yet fixed (the idea says "TBD", or `CLAUDE.md` still has
placeholder values), propose a stack with a one-line rationale tied to the idea, and
confirm it with the developer via `AskUserQuestion` before populating files. Do not
assume — a wrong stack choice here is expensive to reverse.

### Step 3 - Define the first block

A new project cannot be built all at once. From the idea, identify the **foundation
block** — the smallest unit that establishes the project and unblocks everything else
(typically: project scaffold + core data model + one end-to-end slice). Later features
depend on it; sequence them after it. Name the foundation block and what it includes.

### Step 4 - Populate project files

Commands (test, build, dev, type-check) were already filled in from the wizard at
scaffold time — `.claude/settings.json` and `.claude/rules/pipeline.md` need no edits.
What remains is the project knowledge only you and the idea can supply:

**Always populate:**
- `CLAUDE.md` - fill in the `[PLACEHOLDER]` sections: project overview, the resolved
  tech stack, coding conventions, and any known patterns implied by the idea

**If Tier M or L:**
- `docs/requirements.md` - populate from the idea: the foundation block plus the features it enables
- `docs/implementation-checklist.md` - list the foundation block first, then dependent blocks in order

### Step 5 - Present discovery summary

Present a structured summary:

```
## Discovery Summary

### Project: [name]
**Idea**: [one-line restatement]
**Stack**: [resolved stack + one-line rationale]
**Surface**: [CLI / web / API / native / mix]
**Storage**: [local / database / none]

### Foundation block (block 1)
[what it includes and why it comes first]

### Planned blocks (after foundation)
[ordered list derived from the idea]

### Files populated
- CLAUDE.md ✓
- .claude/settings.json (Stop hook) ✓
- docs/requirements.md ✓ / ✗

### Gaps - questions for you
[Anything that could NOT be inferred from the idea and needs the developer's input]
```

### Step 6 - Ask targeted gap questions

Use `AskUserQuestion` for anything the idea did not settle:
- Stack, if still open after Step 2
- Storage/persistence choice (local vs database)
- Deployment target
- Scope of the first version (what is explicitly out)

### Step 7 - Mark discovery complete

After the developer confirms the summary and all gap questions are answered:

1. Update this file: change `Status: PENDING_DISCOVERY` → `Status: COMPLETE`
2. Add a completion note:

```
## Discovery completed

**Date**: [YYYY-MM-DD]
**Stack chosen**: [stack]
**Foundation block**: [name]
**Gaps resolved**: [list of questions answered by developer]
```

3. Run `npx tierward doctor` to validate the setup.

---

## Notes for subsequent sessions

Once Status is `COMPLETE`, this file serves as a record of the initial discovery. Claude
should not re-run the discovery workflow. If the project direction changes significantly,
delete the "Status: COMPLETE" line to trigger a re-discovery.
