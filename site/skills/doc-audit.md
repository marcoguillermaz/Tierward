# /doc-audit

> Static documentation drift audit - relative-link resolution, code-block syntax, Tierward placeholder residuals, slash-command name match, skill-count consistency, ADR marker freshness, stack-specific doc sync (Next.js / Django / Swift).

| Tiers | Model | Flags |
|---|---|---|
| Tier M · Tier L | Sonnet | `[target:path:<dir>\|target:file:<glob>\|mode:all]` |

---

## When to use

Run after refactoring commands, renaming skills, or cutting a major version, to verify that documentation stays consistent with the actual codebase. It prevents the common drift where code evolves but guides, READMEs, and ADRs still reference old names or defunct paths.

## Expected output

A structured report listing broken links, code blocks with invalid syntax, stale skill or command names, unreplaced Tierward placeholders, and ADRs older than the configured freshness threshold. A typical finding: five slash-command references in a guide pointing to skill names that were renamed in the last release.
