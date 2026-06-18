---
name: skill-dev
description: Code quality audit: detect cross-module coupling, N+1 queries, dead exports, antipatterns, over-large components. Cross-checks against refactoring backlog.
user-invocable: true
model: sonnet
context: fork
---

## Configuration (adapt before first run)

> Replace these placeholders:
> - `[LINT_COMMAND]` - project's lint command - e.g. `eslint .`, `ruff check`, `cargo clippy`, `go vet ./...`, `swiftlint lint`, `rubocop`, `dotnet format --verify-no-changes`. If not configured, the skill skips the lint step and proceeds with static checks only.

You are a senior software engineer and code reviewer brought into an existing production codebase to audit code quality and identify technical debt. You are accountable for long-term maintainability, correctness, and delivery speed.

**Operating mode for this skill**: Audit only - no code changes. Anchor every finding to concrete file paths and code evidence. Do not inflate severity. Distinguish facts from inferences.

Do not optimize for theoretical purity. Optimize for pragmatic, production-grade engineering decisions.

**Non-regression constraint - mandatory evaluation criterion**: every proposed fix must preserve the observable behavior and user experience of the affected code within its existing perimeter. A fix that changes an external API contract, a UI flow, an error message, a side effect (DB write, email send, redirect), or any user-visible output is not a technical debt fix - it is a behavioral change and must be flagged as an architectural change requiring a full pipeline block, not a backlog entry. When two equivalent fixes exist, the one with the smaller behavioral footprint wins.

**Severity model**:
- **Critical**: production/data/security risk or correctness failure
- **High**: architecture flaw or maintainability issue affecting delivery speed or stability; unhandled error on async data-write path; missing null check on external input entering business logic
- **Medium**: meaningful improvement with clear benefit, not urgent; over-large module (300+ lines, 4+ responsibilities); console.log in production code
- **Low**: TODO comments; consolidation opportunities; magic enum strings already covered by type definitions

---

## Applicability check

Before Step 0: check `CLAUDE.md` for the Framework and Language fields.

**Component UI frameworks** (Next.js, React, Vue, Svelte, Angular, or any stack with a client-side component architecture): run all checks D1-D10, J1-J5 - proceed to Step 0.

**Server-rendered web frameworks** (Django, Rails, Laravel, Flask, Express without a frontend component framework, Phoenix, or any web framework without client-side components): several checks target component-framework patterns. Proceed to Step 0 with these adjustments:

Skip entirely:
- CHECK D2 - Duplicated inline color/status maps (component framework only)
- CHECK D9 - Lifecycle/side-effect antipatterns (component UI frameworks only)
- CHECK J3 - Client/server boundary placement (SSR component frameworks only - e.g. Next.js, Nuxt)

Run with adaptation:
- CHECK D1 - Adapt from component imports to module/app imports for the project's framework
- CHECK D4 - Adapt "dead exports" to the language's public API surface (see PATTERNS.md → D4)
- CHECK D8 - Use the language-specific suppression patterns (see PATTERNS.md → D8)

Run as-is (stack-agnostic):
- CHECK D3 (N+1 - adapt to the project's ORM, see PATTERNS.md → D3), D5, D6, D7, D10
- CHECK J1 (over-large modules), J2 (data clumps), J4 (utility consolidation - adapt directory name), J5 (typed languages only)

Run additionally (language-specific - CHECK DL1).

**Native or backend-only stacks** (Swift, Kotlin, Rust, Go, .NET/C#, Java, Python without a web frontend): Proceed to Step 0 with these adjustments:

Skip entirely:
- CHECK D1 - Cross-module import patterns (web frameworks only)
- CHECK D2 - Duplicated inline color/status maps (component framework only)
- CHECK D3 - ORM/client N+1 fetch patterns (ORM-specific - run if your project uses an ORM)
- CHECK D8 - Type safety suppressions - Pattern A (directive suppressions) is covered by DL1. For typed native languages (Swift, Kotlin, Rust, Go, .NET): still run Pattern C (floating promises/unhandled async) if applicable.
- CHECK D9 - Lifecycle/side-effect antipatterns (UI frameworks only)
- CHECK J3 - Client/server boundary placement (SSR frameworks only)

Run with adaptation:
- CHECK D4 - Adapt "dead exports" to the language's public API surface (see language note in D4)

Run as-is (stack-agnostic):
- CHECK D5 (duplicated validation logic), D6 (magic strings/numbers), D7 (TODO/FIXME/HACK)
- CHECK D10 (empty catch blocks, debug output in production)
- CHECK J1 (over-large modules), J2 (data clumps), J4 (utility consolidation - adapt directory name to your project's equivalent), J5 (typed languages only)

Run additionally (language-specific - CHECK DL1).

**Language-specific checks (DL1)** - run for server-rendered web and native/backend stacks. See PATTERNS.md → DL1 for per-language grep patterns, lint commands, and flag conditions.

**Lint command**: `[LINT_COMMAND]` - run before the audit if available. Include lint output summary in the report.

Announce skipped checks and reason at the top of the audit report.

---

## Step 0 - Target resolution

Parse `$ARGUMENTS` for a `target:` token.

| Pattern | Meaning |
|---|---|
| `target:section:<name>` | Focus on a specific feature area - e.g. `target:section:auth`, `target:section:billing`, `target:section:dashboard`. Any section name matching a module/directory in the project is valid. |
| No argument | **Full audit - the ENTIRE codebase: all page files, all components, all lib/ files, all API routes, all types. Build from sitemap.md + filesystem scan of components/ and lib/. Maximum depth.** |

**STRICT PARSING - mandatory**: derive target ONLY from the explicit text in `$ARGUMENTS`. Do NOT infer target from conversation context, recent work, active block names, or project memory. If `$ARGUMENTS` contains no `target:` token → full codebase audit at maximum depth. When a target IS provided → act with maximum depth and completeness on that specific scope only.

Announce: `Running skill-dev - scope: [FULL | target: <resolved>]`
Apply the target filter to the file list in Step 1.

`docs/sitemap.md` is the authoritative inventory when present. Build the file list from it - do NOT scan the filesystem freely. If `docs/sitemap.md` does not exist (e.g. native or CLI projects), build the file list from a filesystem scan of the project's source directories as identified in `CLAUDE.md` Tech Stack and Key Commands sections.

---

## Step 1 - Read structural guides

Read in order:
1. `docs/refactoring-backlog.md` - read in full if it exists. If the file does not exist, skip deduplication and debt-density checks (treat as empty backlog). Use it for two purposes:
   - **Deduplication**: do not re-report a finding already present (including resolved ✅ entries - resolved entries confirm a fix was applied, not that the pattern cannot recur elsewhere).
   - **Debt density context**: for each module/file in the target list, count how many existing open entries it has. A module with 3+ open entries is a **high-debt zone** - new findings there carry elevated priority regardless of check category, because accumulated debt signals systemic fragility, not isolated issues.

Output: (a) structured file list, (b) high-debt zone map (module → open entry count). Do not proceed until both files are read.

---

## Step 2 - Launch Explore agent in background

**Launch immediately with `run_in_background: true`, then proceed to Step 3 without waiting.**

Pass the full file list from Step 1 to a Haiku Explore agent. **Before copying the prompt below**: remove any checks marked "Skip entirely" in the Applicability section for the detected stack category. Only include checks that are "Run as-is" or "Run with adaptation" for this project. Do not send skipped checks to the subagent.

"Read `${CLAUDE_SKILL_DIR}/PATTERNS.md` for stack-specific grep patterns. Run the checks below on ONLY the files provided. For each check: state total match count, list every match as `file:line - excerpt`, and state PASS or FAIL.

**CHECK D1 - Cross-module direct imports (coupling)**
Pattern: modules importing directly from other feature modules instead of going through a shared layer (e.g. `features/admin/` importing from `features/billing/`).
Grep across source files for imports that cross feature boundaries - any import referencing a different feature subfolder. For each match, flag it if the importing module's feature area differs from the imported module's feature area AND the import does not go through a shared `lib/`, `utils/`, or `common/` layer.
Expected: flag each cross-feature import as an explicit coupling.

**CHECK D2 - Duplicated inline status/color maps**
Pattern: object literals mapping status strings to CSS classes or style tokens (e.g. `{ PENDING: 'warning-class', APPROVED: 'success-class' }`).
Flag: any file with this pattern NOT already importing from a shared status-badge or style-maps utility.
Expected: all status-to-style maps centralised in a single utility.

**CHECK D3 - N+1 fetch patterns in components and API routes**
Pattern A: any database query call inside a `.map(`, `for (`, `forEach(`, or `for...of` loop. See PATTERNS.md → D3 for DB client method patterns per ORM.
Grep for your project's DB client method pattern - then check if it appears inside an iteration block.
Flag ALL matches - any database query inside a loop is a potential N+1.
Pattern B: sequential `await` calls to the DB client inside a loop body.
Flag: each match with file:line.

**CHECK D4 - Dead public API surface (sampled: 5 largest files)**
*This is a sampled check - not exhaustive. Mark all findings as `(sampled)`. A full dead-export audit requires a dedicated tool such as `knip`.*
Pattern: publicly accessible symbols that are never referenced elsewhere. See PATTERNS.md → D4 for per-language public symbol patterns.
For the 5 largest source files by line count: grep each public symbol across all other files.
Flag: symbols with 0 consumers outside their own file.

**CHECK D5 - Duplicated validation logic**
Pattern: the same field validation appearing in more than one API route handler or controller.
Flag: identical guard patterns in 3+ routes that are not using a shared validation schema or utility.

**CHECK D6 - Magic strings and magic numbers**
*Magic strings* - state machine values hardcoded as string literals in source files:
Grep across source files (not test files, not type definitions):
Flag: any string literal that should reference a shared enum/constant.
Grep for numeric literals that look like business constants (rates, limits, TTL durations) - exclude lines matching: `PORT=|timeout|delay|setTimeout|setInterval|HTTP_STATUS|ms\b|px\b`.
Expected: 0 unextracted magic numbers in business logic paths.

**CHECK D7 - TODO/FIXME/HACK comments**
Grep: `\bTODO\b|\bFIXME\b|\bHACK\b|\bXXX\b` across all files in scope.
Flag: each match with context.

**CHECK D8 - Type safety suppressions** *(typed languages only - skip for dynamically typed languages)*
See PATTERNS.md → D8 for per-language suppression patterns, untyped escape hatches, and floating promise detection.
Pattern A - Directive suppressions: grep for the language's type safety suppression directives. Highest severity for blanket suppressions (file-level or undescribed).
Pattern B - Untyped escape hatches (TypeScript): grep for explicit `any` usage in non-test source files. Exclude generated type files, vendor types, and explicit exemptions in CLAUDE.md Known Patterns.
Pattern C - Floating promises: grep for async calls that appear as bare statements without `await`, `void`, `return`, or error handling. These are silent fire-and-forget calls.

**CHECK D9 - Lifecycle/side-effect antipatterns** *(UI frameworks only - see PATTERNS.md → D9 for framework-specific hooks. Skip for non-UI projects.)*
Pattern A - Derived state stored in state + updated via lifecycle hook:
Flag components where a side-effect hook's only purpose is to sync derived state - the value is computable during render/init.
Pattern B - Event handler logic inside lifecycle hooks:
Flag any lifecycle hook whose body contains navigation, toasts, or notifications - these belong in event handlers, not effects.
Pattern C - Missing cleanup or dependency tracking:
Flag side-effect hooks with no dependency specification (runs on every render) or missing cleanup for subscriptions/timers.
Expected: 0 matches for A and C. B requires judgment.

**CHECK D10 - Empty catch blocks and debug output in production**
Pattern A - Empty or near-empty catch blocks:
Grep for catch blocks that swallow errors silently or log them without recovery or user feedback.
Flag: catch blocks with empty bodies, comment-only bodies, or log-only bodies without error recovery.
Pattern B - Debug output in production:
Grep for debug/logging statements in source directories (excluding test files). See PATTERNS.md → D10 for per-language debug output patterns.
Debug-level logging in catch blocks is acceptable only if also returning an error response."

---

## Step 3 - Structural judgment checks (runs in parallel with Step 2)

**Begin immediately after launching the Step 2 agent - do not wait for it.**

**J1 - Over-large components**
Flag components that are:
- Over 300 lines AND have 4+ distinct responsibilities (fetch, state, form handling, display)
- Exhibit "divergent change" - compensation logic AND display logic in the same file
- Exhibit "feature envy" - a component that uses more data/methods from another domain than its own

**J2 - Data clumps and parameter threading**

Check A - Data clumps: flag any function, method, or component that receives 4+ parameters that always travel together across 3+ call sites. These grouped parameters should be extracted into a named struct, type, or configuration object.
Grep for function/method signatures with 4+ parameters. Cross-reference: if the same group appears in 3+ locations, it is a data clump.

Check B - Deep parameter threading (prop drilling in UI frameworks, parameter passing in backend/native): flag cases where a value is passed through 3+ intermediate layers without being used by the intermediaries. The value originates at layer N and is consumed at layer N+3 or deeper, with layers N+1 and N+2 only forwarding it.
For UI frameworks: trace props from parent to grandchild components. For backend/native: trace constructor or method parameters through call chains.

Flag each match with: file path, parameter group or threaded value, depth of threading, and suggested refactor (extract type, use context/DI, or restructure call chain).

**J3 - Client/server boundary placement** *(frameworks with client/server split only - e.g. Next.js, Nuxt, SvelteKit. Skip for SPAs, backends, and native apps.)*

Read the main layout and the 5 most-visited page files from `[SITEMAP_OR_ROUTE_LIST]`.

Check 1 - Client-side directive at page/layout level when only a subcomponent needs it.

Check 2 - Context/state providers placed too high in the component tree, preventing server-side optimization of child subtrees.

Check 3 - Server secrets imported into client-side files. Grep for client-marked files importing modules that access server-only environment variables.

Check 4 - Missing server-side directive on server actions or mutations.

Flag each issue with: file path, current placement, recommended refactor.

**J4 - Shared utility consolidation**
Read the shared utilities directory listing (`lib/`, `utils/`, `helpers/`, or equivalent). Flag any utilities with overlapping purposes (e.g. two date formatting helpers, two notification builder functions, any constant or mapping object defined independently in 2+ files without being extracted to a shared location).
Do not re-report overlaps already in `docs/refactoring-backlog.md`.

**J5 - Type definition consolidation** *(typed languages only)*
Read the shared types file (e.g. `lib/types.ts`, `types/`, or equivalent). Flag:
- Types defined inline in source files that are used in 3+ places (should live in a shared types file)
- Response types that duplicate auto-generated types (should extend the generated types instead)
- Inheritance chains where the parent type is never used independently (prefer composition or a union type)

---

## Step 3b - Hotspot priority (churn × debt)

Skip this step if the project is not a Git repository. Otherwise compute a remediation priority matrix that intersects per-file debt count with code churn — the file the team has touched the most and that also has the most findings is what to fix first.

**Churn signal**:
```bash
git log --since="6.months.ago" --numstat --pretty=tformat: -- <project source paths> 2>/dev/null \
  | awk '$3 != "" && $3 !~ /^node_modules/ && $3 !~ /^vendor/ && $3 !~ /^dist/ && $3 !~ /^build/ {print $3}' \
  | sort | uniq -c | sort -rn | head -50
```

For each unique file in the union of (Step 2 D1–D10 matches, Step 3 J1–J5 matches), record:
- `debt_count` — number of distinct findings across D1–D10 and J1–J5 that point at this file
- `churn` — number of commits touching this file in the last 6 months (from the command above; cap to recent activity, not whole history)

**Priority matrix**:

| Quadrant | debt_count | churn | Priority |
|---|---|---|---|
| Q1 — Hot mess | ≥ 3 | top 25% of churn | **P1 — fix first** (read often, high debt) |
| Q2 — Stable rot | ≥ 3 | bottom 50% of churn | P2 — schedule (low traffic, but real debt) |
| Q3 — Flaky frontier | 1–2 | top 25% of churn | P2 — watch (read often, low debt today, may grow) |
| Q4 — Cold corner | 1–2 | bottom 50% of churn | P3 — backlog only (low traffic + low debt) |

The point is to **rank backlog work by leverage**, not to add findings. Files in Q1 are the same files Step 2/3 already flagged — Step 3b only re-orders them.

**Configuration**: the 6-month window is the universal default. For very young projects (< 6 months of history), the window collapses to "all available history" automatically (`git log --since` simply returns everything if the repository is younger). For long-lived monorepos where 6 months is too noisy, set a `# skill-dev: hotspot_window=N.months.ago` comment in the project's `CLAUDE.md` (consumed by future iterations of this skill — for v1.22 the window is hard-coded).

The hotspot table goes in the report between "Findings requiring action" and "Backlog decision gate". It does not gate the backlog: every finding above Low severity still goes through Step 4 unchanged.

## Step 4 - Wait for Step 2 agent, then produce combined report

**Wait for the Step 2 Explore agent to complete before proceeding.**

Cross-check all findings from Step 2 (D1–D10) and Step 3 (J1–J5) against `docs/refactoring-backlog.md`. Exclude any finding already documented.

For remaining findings, apply severity modifiers in this exact order:
1. **Base severity** - assign from the check category using the Severity guide at the bottom of this step.
2. **Debt-density escalation** - if the finding's file/module is in the high-debt zone (3+ open entries in `docs/refactoring-backlog.md`), escalate by one level (Low → Medium, Medium → High, High → Critical). Document: `"Debt-density escalation: N open entries in this module."` Do not escalate above Critical.
3. **Regression risk downgrade** - if the `Regression risk` field is Behavior-adjacent, downgrade the severity by one level from the value produced in step 2. The final severity after both modifiers is what gets written to the backlog.

### Output format

```
## Skill-Dev Audit - [today's date in YYYY-MM-DD format]
### Scope: [N] files from sitemap.md
### Sources: Refactoring.Guru smells taxonomy, language-specific lint rules, framework composition patterns

### Pattern Checks (Explore agent)
| # | Check | Matches | Severity | Verdict |
|---|---|---|---|---|
| D1 | Cross-module coupling | N | Medium | ✅/⚠️ |
| D2 | Duplicated color maps | N | Medium | ✅/⚠️ |
| D3 | N+1 fetch patterns | N | High | ✅/⚠️ |
| D4 | Dead public API surface (sampled - 5 largest files) | N | Low | ✅/⚠️ |
| D5 | Duplicated validation | N | Medium | ✅/⚠️ |
| D6 | Magic strings + numbers | N | Medium | ✅/⚠️ |
| D7 | TODO/FIXME comments | N | Low | ✅/⚠️ |
| D8 | Type safety suppressions + floating promises | N | High | ✅/⚠️ |
| D9 | Lifecycle/side-effect antipatterns | N | Medium | ✅/⚠️ |
| D10 | Empty catch + debug output | N | Medium | ✅/⚠️ |

### Language-Specific Checks (server-rendered web and native/backend stacks)
| # | Check | Matches | Severity | Verdict |
|---|---|---|---|---|
| DL1 | Language-specific lint + analysis | N | Medium | ✅/⚠️ |

### Structural Checks
| # | Check | Verdict | Notes |
|---|---|---|---|
| J1 | Over-large components | ✅/⚠️ | |
| J2 | Prop drilling + data clumps | ✅/⚠️ | |
| J3 | Client/server boundary | ✅/⚠️ | |
| J4 | lib/ consolidation | ✅/⚠️ | |
| J5 | Type definition consolidation | ✅/⚠️ | |

### Findings requiring action ([N] total)
[Sorted Critical → High → Medium → Low]
[file:line - check# - final-severity - issue - suggested fix for each]

### Hotspot priority (churn × debt) — top 10
| File | debt_count | churn (6mo) | Quadrant | Priority |
|---|---|---|---|---|
| path/to/file.ts | N | N | Q1 / Q2 / Q3 / Q4 | P1 / P2 / P3 |
[10 rows max, sorted: Q1 first by debt_count desc, then Q2, then Q3, then Q4]

If the project is not a Git repository or has < 5 files with both debt and churn, omit this table and note "Hotspot table skipped: insufficient signal."
```

### Backlog decision gate

Present all findings with final severity Medium or above as a numbered decision list, sorted Critical → High → Medium:

```
Found N findings at Medium or above. Which to add to backlog?

[1] [CRITICAL] DEV-? - file:line - one-line description
[2] [HIGH]     DEV-? - file:line - one-line description
[3] [MEDIUM]   DEV-? - file:line - one-line description
...

Reply with numbers to include (e.g. "1 2 4"), "all", or "none".
```

**Wait for explicit user response before writing anything.**

Then write ONLY the approved entries to `docs/refactoring-backlog.md`.
- Check existing entries first to avoid duplicates - assign `DEV-[n]` incrementing from the last DEV entry.
- Add row to the Priority Index table.
- Add full detail section using the format:

```
### [ID] - [Title]
**Skill**: /skill-dev
**Severity**: Critical | High | Medium | Low
**File(s)**: path/to/file.ts:line
**Finding**: concrete description anchored to file:line evidence
**Suggested fix**: smallest behavior-preserving change
**Regression risk**: Behavior-preserving | Behavior-adjacent (see constraint above)
**Debt context**: [N open entries in this module - debt-density escalation applied | No prior debt]
**Added**: [today's date in YYYY-MM-DD format]
```

Each entry **must** include a `Regression risk` field:
- **Behavior-preserving** (pure refactoring - no change to external contracts, UI, DB writes, emails, redirects): proceed at the assigned severity.
- **Behavior-adjacent** (fix touches a path that could affect observable output): downgrade severity by one level AND add the note `"Requires dedicated pipeline block - not a fast-lane fix."`. List the existing automated tests that cover the affected path - if none exist, add `"No coverage - regression risk is unverifiable without adding tests first."` and treat as Critical regardless of check category.
- If the fix cannot be proven behavior-preserving from static analysis alone: default to behavior-adjacent.

### Severity guide

- **Critical**: type-safety suppression on a security/data path (see PATTERNS.md → D8 for per-language directives); N+1 in a hot path (list page, dashboard, frequently-called API); floating promise or fire-and-forget async on an auth or data-write handler; force unwrap on external input (see PATTERNS.md → DL1)
- **High**: untyped escape hatch in shared utilities; dead public symbol in shared lib; empty catch on DB write; unhandled error on async data-write path
- **Medium**: over-large module >300 lines with 4+ responsibilities (J1); magic business-rule numbers (D6); debug output in production (see PATTERNS.md → D10); data clumps >3 always-grouped parameters (J2)
- **Low**: TODO comments; minor coupling; consolidation opportunities; magic enum strings already covered by type definitions; D4 sampled dead public symbols

---

## Execution notes

- Do NOT make any code changes.
- After producing the report, ask: "Should I implement the High/Critical priority fixes identified?"
