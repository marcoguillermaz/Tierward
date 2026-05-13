# Cross-LLM Rubric — Pilot Test v1 Execution

Manual execution of the SHOULD PASS scoring against the rubric locked in
`memory/project_context_builder_rubric_v1.md`.

## Why manual in v1

Lockedin scope freeze (`memory/project_context_builder_scope_v1.md`):
automated cross-LLM scoring is deferred to v1.1. The v1 pilot is a
one-time validation across 3 repos; manual cost ≈ 1h.

## How to run a pilot round

For each of the 3 target repos (see `memory/project_context_builder_pilot_v1.md`):

1. Run `npx mg-claude-dev-kit context` in the repo to generate `CONTEXT.md`.
2. Run `npx mg-claude-dev-kit doctor` (or use `validateContextFile()`) to
   verify all 16 MUST PASS criteria are green.
   - If any MUST fail → **REJECT**, fix and re-run.
3. Copy the content of `CONTEXT.md` into the `{CONTEXT_MD_CONTENT}` slot of
   `prompt-template.md`.
4. For existing repos, prepare a `REPO_SUMMARY` (a few README excerpts +
   `ls` tree, ~1-2 KB).
5. Send the populated prompt to **3 models**:
   - `claude-opus-4-7` (or latest Opus)
   - `claude-sonnet-4-6`
   - Gemini Pro (latest)
6. For each criterion, take the **median** of the three scores.
7. PASS iff:
   - All medians ≥ 2 **AND**
   - ≥ 80 % of applicable criteria have median ≥ 2

## Acceptance gate v1 release

Locked: **3/3 PASS strict**.

- 3/3 → release v1 GO
- 2/3 → BLOCK, fix the failing repo
- ≤ 1/3 → BLOCK + retrospective on schema / rubric

## Reporting

Append per-repo results to `docs/reviews/context-builder-pilot-v1.md`
(template provided).
