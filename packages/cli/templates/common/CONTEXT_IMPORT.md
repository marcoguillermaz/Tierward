# Context Import - Discovery Required

**Status**: `PENDING_DISCOVERY`

> Claude: read this file at the start of every session until Status is `COMPLETE`.
> When Status is `PENDING_DISCOVERY`, execute the Discovery Workflow below **before any other work**.

---

## Import mode

`[IMPORT_MODE]`
<!-- Values: "from-context" | "in-place" -->

## Source repositories

<!-- Populated by tierward init -->
[SOURCE_REPOS]

## Source documents

<!-- Populated by tierward init -->
[SOURCE_DOCS]

## Primary repository

`[PRIMARY_REPO]`

---

## Discovery Workflow

Execute these steps **in order** before any development work. This is a one-time setup pass.

### Step 1 - Read source repositories

For each repository listed under "Source repositories":

1. Read the root-level files: `README.md`, `package.json` / `requirements.txt` / `go.mod`, `CLAUDE.md` (if present)
2. Explore the folder structure (1–2 levels deep): identify architecture pattern (feature-based, layered, MVC, etc.)
3. Extract:
   - **Tech stack**: language, framework, DB, auth, test framework, deployment platform
   - **Key commands**: install, dev, build, test, type-check
   - **Folder conventions**: where components live, where API routes live, where utilities live
   - **Naming conventions**: camelCase/snake_case, file naming, component naming
   - **Roles / RBAC**: if a permission model exists, document the roles and their access
   - **State machines**: any multi-state workflows (order states, document lifecycle, approval flows)
   - **Known patterns**: any non-obvious technical decisions visible in code comments or README
   - **Test setup**: framework, test file locations, coverage approach

### Step 2 - Read source documents

For each file listed under "Source documents":
- Extract: product requirements, business rules, user roles, key workflows, data model hints
- Note any architectural decisions that should become ADRs

### Step 3 - Populate project files

Using what was discovered, populate the following files **with real content** (replace all `[PLACEHOLDER]` values):

**Always populate:**
- `CLAUDE.md` - fill in: project overview, tech stack, key commands, coding conventions, known patterns
- `.claude/rules/pipeline.md` - replace `[TYPE_CHECK_COMMAND]`, `[TEST_COMMAND]`, `[BUILD_COMMAND]`, `[DEV_COMMAND]`
- `.claude/settings.json` - replace `[TEST_COMMAND]` in the Stop hook

**If Tier M or L:**
- `docs/requirements.md` - populate with extracted product requirements and key workflows
- `docs/implementation-checklist.md` - add initial planned blocks based on requirements

**If architectural decisions were found in source docs:**
- Create `docs/adr/NNNN-title.md` for each significant decision (use the ADR template)

### Step 4 - Present discovery summary

Present a structured summary:

```
## Discovery Summary

### Project: [name]
**Stack**: [detected stack]
**Framework**: [detected framework]
**Architecture**: [pattern identified]

### Key commands detected
- Install: [command]
- Dev: [command]
- Build: [command]
- Test: [command]
- Type check: [command or N/A]

### Roles / RBAC
[List roles found, or "None detected"]

### State machines
[List workflows found, or "None detected"]

### ADRs created
[List any ADR files created, or "None"]

### Files populated
- CLAUDE.md ✓
- .claude/settings.json (Stop hook) ✓
- docs/requirements.md ✓ / ✗
- [any other files]

### Gaps - questions for you
[List anything that could NOT be inferred and needs the developer's input]
```

### Step 5 - Ask targeted gap questions

Use `AskUserQuestion` for anything that could not be inferred:
- Auth mechanism (if not visible from code)
- Deployment target (if not in README or package.json)
- Team size (for tier validation)
- Any role/permission model not visible in code

### Step 6 - Mark discovery complete

After the developer confirms the summary and all gap questions are answered:

1. Update this file: change `Status: PENDING_DISCOVERY` → `Status: COMPLETE`
2. Add a completion note:

```
## Discovery completed

**Date**: [YYYY-MM-DD]
**Populated**: [list of files that were filled in]
**Gaps resolved**: [list of questions answered by developer]
```

3. Run `npx tierward doctor` to validate the setup.

---

## Notes for subsequent sessions

Once Status is `COMPLETE`, this file serves as a record of the import. Claude should not re-run the discovery workflow. If the project evolves significantly, delete the "Status: COMPLETE" line to trigger a re-discovery.
