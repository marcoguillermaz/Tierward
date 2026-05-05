# Context File Review Checklist

Executed in **Phase 8.5** at the end of every block.
Each check has a specific, verifiable pass/fail condition.
**The phase is complete only when all checks are ✅ - not when the review "seems thorough".**

---

## C1 - Security: no credentials in auto-memory

**What**: grep for token/secret patterns in the auto-memory MEMORY.md.
**Pass**: 0 matches (placeholder strings like `sbp_...` or `re_...` with no further characters are allowed).
**Fail**: redact immediately → replace value with `...see .env.local` → remind user to rotate the exposed credential.
**Note**: `must_change_password`, `password=false` in code examples are NOT credentials - they are property names. The grep targets actual token strings (minimum 10 chars after the prefix).

---

## C2 - Language: no non-English prose in internal explanatory text

**Scope**: every non-code-block line in CLAUDE.md and auto-memory MEMORY.md.
**Flag** non-English words that are clearly explanatory prose, not quoted values or domain terms.

**Configure the keyword list for your team's primary non-English language risk.** The check is opt-in: set `[NON_ENGLISH_KEYWORDS]` to a pipe-separated list of indicator words for the language your team accidentally falls back to. Examples:

- Italian: `però|perché|attualmente|verifica|aggiorna|necessario|obbligatori`
- Spanish: `también|aunque|actualmente|verificar|actualizar|necesario|obligatorio`
- French: `également|cependant|actuellement|vérifier|mettre à jour|nécessaire|obligatoire`
- German: `auch|jedoch|derzeit|prüfen|aktualisieren|notwendig|erforderlich`

If your team writes in English natively and never code-switches, leave `[NON_ENGLISH_KEYWORDS]` empty and skip C2.

**Run on CLAUDE.md**: `grep -nE "[NON_ENGLISH_KEYWORDS]" CLAUDE.md` (replace the placeholder with your configured list).
**Run on auto-memory**: same grep on `~/.claude/projects/<project-path-hash>/memory/MEMORY.md` (run `ls ~/.claude/projects/` to find your project hash)
**Pass**: 0 matches, or all matches are inside quoted UI strings or domain values.
**Fail**: translate flagged text to English.

---

## C3 - Field name staleness (CLAUDE.md)

**What**: every data field name mentioned in CLAUDE.md must exist in the current schema or data model.
**Specific risk pattern**: field renames across blocks. After each block that renames a column or field: immediately update every mention in CLAUDE.md.

**Pass**: all field names in CLAUDE.md match the current schema or data model.
**Fail**: update the field name and add the rename to Known Patterns if non-obvious.

---

## C4 - Stale block references (CLAUDE.md + auto-memory)

**What**: references like "(Block N)", "(optional, Block N)", "from Block N" must not describe closed blocks as if they are open or future.
**Run on CLAUDE.md**: `grep -n "Block [0-9]" CLAUDE.md`
**Run on auto-memory**: same grep on `~/.claude/projects/<project-path-hash>/memory/MEMORY.md` (run `ls ~/.claude/projects/` to find your project hash)
**Pass**: every match is either a historical note in past tense ("renamed in Block 3") or references a genuinely open block.
**Fail**: remove forward-looking block references for closed blocks; convert to past tense if the historical context is useful.

---

## C5 - MEMORY.md qualifier completeness (pipeline.md)

**What**: every mention of "MEMORY.md" in pipeline.md must be unambiguous about which file is meant.
**Run**: `grep -n "MEMORY\.md" .claude/rules/pipeline.md`
**Pass**: every match contains one of: `(project root)`, `auto-memory`, or is wrapped in backticks as a filename reference within a code block.
**Fail**: add the appropriate qualifier.

---

## C6 - No duplication: auto-memory vs CLAUDE.md

**What**: a pattern in auto-memory that has become a stable project truth belongs in CLAUDE.md, not in both files.
**Check method**: read the "Key technical patterns" section of auto-memory and the "Known Patterns" section of CLAUDE.md side by side.
**Pass**: no entry is substantially identical in both files (same pattern + same fix + same context).
**Fail**: remove from auto-memory; CLAUDE.md is the canonical location for stable patterns.

---

## C7 - Size compliance

**Pass**: file < 150 lines.
**Fail**: extract oldest or least-referenced patterns into a new section of the auto-memory file or remove obsolete entries.

---

## C8 - files-guide.md path accuracy

**What**: every file path listed in the "Automatically loaded" tree must exist on disk and be correct.
**Run**: for each path in the tree, `ls [path]` or Glob to confirm existence.
**Also check**: the `CLAUDE.local.md` "Current content" description must match what `.claude/CLAUDE.local.md` actually contains. If the file's purpose has changed, update the description.
**Pass**: all paths resolve; description matches reality.
**Fail**: correct the path or update the description.

---

## C9 - Active plan currency (project-root MEMORY.md)

**What**: the Active plan table must reflect the actual state of the project at the time of the current commit.
**Check each row**:
- Status `🔄 in progress` → is it genuinely still in progress, or was it completed in this block?
- Status `✅` → was it committed and verifiable in the implementation checklist?
- Description → does it accurately describe what happened, not what was planned?
**Pass**: every row is accurate as of the last `git push`.
**Fail**: update status and/or description before closing the session.

---

## C10 - Dead file references (cross-doc)

**What**: file paths referenced in context docs must exist on disk. Any `docs/*.md` or `.claude/*.md` path mentioned in CLAUDE.md, pipeline.md, or refactoring-backlog.md that no longer exists is a silent broken pointer.
**Run**:
```
grep -oE "docs/[a-z A-Z0-9_-]+\.md|\.claude/[a-zA-Z0-9/_-]+\.md" \
  CLAUDE.md .claude/rules/pipeline.md docs/refactoring-backlog.md
```
For each path found, verify it exists: `ls [path]`.
**Pass**: all referenced paths resolve.
**Fail**: remove or update the stale reference before closing.

---

## C11 - Refactoring backlog: completed items

**What**: items in `docs/refactoring-backlog.md` that correspond to work completed in the current block must be removed. Completed items inflate the backlog and dilute attention on real open issues.
**Pass**: no completed item remains open in the priority index or detail sections.
**Fail**: remove from priority index table AND delete the corresponding detail section.

---

## C12 - Canonical docs currency (sitemap + data map)

**What**: verify that the project's route documentation and data model documentation are up to date with the current codebase state. Skip checks for doc files that do not exist in the project.

**Run on route documentation** (e.g., `docs/sitemap.md`):
```
```
Compare the resulting route list against routes listed in the route documentation file. Flag any route present in the filesystem but absent from the docs.

**Run on data model documentation** (e.g., `docs/db-map.md`):
```
```
Compare against the latest migration or schema change. If the documentation references a "Last synced" marker, verify it matches the most recent migration.
**Fail**: update the data model documentation to reflect the current schema, then run the project's refresh script if one exists.

**Note**: this check is a backstop - the Phase 8 doc update steps are the primary enforcement point. C12 catches drift that slipped through.

---

---

## C13 - CLAUDE.md Known Patterns hygiene

**Trigger**: run when CLAUDE.md exceeds 100 lines, OR every 4 completed blocks - whichever comes first. Skip if neither condition is met.

**What**: audit every entry under `## Known Patterns` in `CLAUDE.md` against the decision filter:
> "Would Claude make this mistake on a new block, without prior warning, even after reading the relevant code and schema?"

**Run**: `wc -l CLAUDE.md` to check line count first. If < 100 lines AND fewer than 4 blocks since last C13 ran → skip and mark ✅.

**For each entry that fails the filter** (it's a schema fact, historical note, or something Claude would recover from reading the code):
- Move the full content to an appropriate memory topic file in `~/.claude/projects/<project-path-hash>/memory/` (run `ls ~/.claude/projects/` to find your project hash)
- Remove the entry from CLAUDE.md Known Patterns
- Add or update a pointer in MEMORY.md if the topic file is new

**For each entry that is obsolete** (table renamed, pattern removed, workaround superseded):
- Delete from CLAUDE.md
- If a memory topic file exists for it, delete or archive that too

**Pass**: all remaining Known Patterns entries pass the decision filter; CLAUDE.md ≤ 100 lines (or justified exceptions documented).
**Fail**: demote or delete failing entries, then re-run `wc -l CLAUDE.md` to confirm.

---

## Execution order and completion condition

Run C1 → C2 → C3 → C4 → C5 → C6 → C7 → C8 → C9 → C10 → C11 → C12 in sequence. Run C13 only when its trigger condition is met.
Apply any fixes found before moving to the next check.
**The phase is complete when C1–C12 have all passed (and C13 if triggered).** Then run `/compact`.

> If a check reveals a pattern worth adding to CLAUDE.md or auto-memory, add it before C6 (duplication check) so the dedup pass catches any overlap.
