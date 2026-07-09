---
name: ui-audit
description: Audit UI for design token compliance and component adoption. Static grep-based analysis against the sitemap's page and component files. Requires a design system with semantic tokens.
user-invocable: true
model: sonnet
context: fork
argument-hint: [target:section:<section-name>]
allowed-tools: Read Glob Grep Agent Edit Write
---

## Configuration (fill in before first run)

> Replace these placeholders:
> - `[SITEMAP_OR_ROUTE_LIST]` - e.g. `docs/sitemap.md`, `docs/routes.md`, `src/router/index.ts`
> - `[APP_SOURCE_GLOB]` - fallback if no sitemap: `app/**/page.tsx`, `src/**/*.vue`, `templates/**/*.html`
> - `[DYNAMIC_ROUTE_PATTERN]` - pattern for dynamic route segments. Examples: Next.js `/[id]`, SvelteKit `/[id]`, Django `<int:pk>`, Rails `:id`, native: "detail view controllers"
>
> If `[SITEMAP_OR_ROUTE_LIST]` is not filled, the skill reports an explicit error and exits.
> If filled but the file does not exist on disk, the skill falls back to `[APP_SOURCE_GLOB]`.

**Critical constraint**: `[SITEMAP_OR_ROUTE_LIST]` is the authoritative inventory of every page file and key component. Read it first and derive the file target list from it. Do NOT run free-form `grep -r` across source directories - scope every check to the files listed in the sitemap.

**Scope boundary**: this skill covers design-token compliance and component adoption only. Accessibility (aria, tabindex, focus, labels, axe-core WCAG scan, APCA contrast) lives in `/accessibility-audit` - run it alongside `/ui-audit` for any UI change.

Static-only skill - no dev server required. Can run concurrently with browser-based skills per pipeline.md.

---

## Step 0 - Target resolution

Parse `$ARGUMENTS` for a `target:` token.

| Pattern | Meaning |
|---|---|
| `target:section:<name>` | Restrict to routes whose path contains `<name>` |
| No target argument | Full audit - ALL routes in `[SITEMAP_OR_ROUTE_LIST]` |

**STRICT PARSING - mandatory**: derive target ONLY from the explicit text in `$ARGUMENTS`. Do NOT infer target from conversation context, recent work, active block names, or project memory. If `$ARGUMENTS` contains no `target:` token → full audit, all routes.

**Target scoping - comparative vs independent checks (mandatory):** some audit skills contain *comparative* checks that derive a project-wide convention by counting usage across the whole inventory - those must ignore the `target:` filter. This skill has none: every check flags matches against a fixed design-system rule, with no adoption-rate denominator or majority-usage count.
- **Comparative checks - full-project by design; the `target:` filter does NOT apply to them:** none. No check derives its baseline by counting across the page inventory.
- **Independent checks - target-safe:** all checks (CHECK 1-12, S1-S4) evaluate individual files in isolation and safely honor the `target:` filter.
- When a `target:` is given: apply the filter to the page and component file list in Step 1 - with one input exception: S1 and S4 inspect shared layout/navigation files that render on every route, so keep those files in scope even when they fall outside the target path. This is an input-scoping detail, not a comparative baseline.

Announce at start: `Running ui-audit - scope: [FULL | target resolved to: N pages]`

Apply the resolved target to Steps 1–3 below - include only the matching page and component files.

---

## Step 1 - Read sitemap and build target lists

Read `[SITEMAP_OR_ROUTE_LIST]`. Build a flat list of all page files and key component files in scope (filtered by target from Step 0). If the sitemap file is missing, fall back to `[APP_SOURCE_GLOB]`.

Output: numbered file list. Do not proceed to Step 2 until the list is complete.

Read `${CLAUDE_SKILL_DIR}/PATTERNS.md` for framework-specific grep patterns and verification methods for each check.

**Platform detection**: determine whether the project uses a web UI framework (HTML/CSS-based) or a native UI framework (platform-native views). Check `PATTERNS.md` first - if a `Platform` value is filled, use it. Otherwise infer from project files (presence of `package.json` with a web framework → web; `Package.swift` / `build.gradle.kts` / `*.csproj` → native).

Announce: `Platform: [web | native]`

Checks marked **[web only]** are skipped on native stacks. All other checks run on both platforms using the patterns from Stack adaptation.

---

## Step 2 - Delegate grep checks to Explore agent

Launch a **single Explore subagent** (model: haiku) with the following instructions and the exact file lists from Step 1. Pass all file paths explicitly - do not ask the agent to discover them.

**Before launching**:
1. Read `${CLAUDE_SKILL_DIR}/PATTERNS.md` (already loaded in Step 1). For each CHECK, inline the user's grep patterns from the reference file into the instructions you pass to the Explore agent. If patterns are not yet filled, pass the checks as-is - the agent will use its own judgment to construct patterns.
2. Pass the **Platform** value from Step 1. Instruct the Explore agent to skip checks marked `[web only]` if Platform is `native`.

### Instructions for the Explore agent:

"Run all 12 checks below. For each check: report the total match count, list every match as `file:line - excerpt`, and state PASS (0 matches) or FAIL (N matches). If a check returns 0 matches, explicitly state '0 matches - PASS'. Do not skip any check.

File scope: use ONLY the page files and component files provided. Do not search outside this list.

Use the grep patterns from the reference file (PATTERNS.md) for each check. If patterns are not filled, use your own judgment to construct patterns appropriate to the project's stack.

---

**CHECK 1 - Multi-column layouts without responsive breakpoints** [Severity: High]
Multi-column layouts must include a responsive breakpoint or adaptive size class to prevent content from being cut off or unreadable on narrow viewports.
Expected: 0 matches - all multi-column layouts should have responsive breakpoints.

**CHECK 2 - Hardcoded color values instead of design tokens** [Severity: High]
All color usage must go through the design system's semantic tokens. Hardcoded color values (hex, rgb, named colors, raw constructors) bypass theming and break light/dark mode.
Exclude: focus/hover states, comments, gradient stops.
Expected: 0 matches.

**CHECK 3 - Hardcoded dark colors on structural containers** [Severity: Medium]
Structural containers (cards, panels, sections) must use semantic surface tokens that adapt to light/dark mode, not hardcoded dark color values.
Expected: 0 matches on structural elements.

**CHECK 4 - Error/required indicators using hardcoded color** [Severity: Medium]
Required-field indicators and error markers must use the design system's semantic error/destructive token, not hardcoded color values.
Expected: 0 matches.

**CHECK 5 - Duplicate style tokens** [Severity: Low]
The same style class, utility, or token must not appear twice in the same element declaration.
Expected: 0 matches.

**CHECK 6 - Bare empty states (no shared component)** [Severity: High]
Empty-state messages (e.g. "No records", "Nothing found") must use a dedicated shared empty-state component, not bare text elements. This ensures visual consistency across all empty states.
Exclude: dedicated empty-state components (see reference file for framework-specific names), toast notifications, placeholder attributes.
Expected: 0 matches.

**CHECK 7 - Back navigation links missing proper display** [Severity: Low] [web only]
Scope: pages containing back-navigation elements that return to a parent view.
Back navigation links must render as block-level elements for adequate touch target sizing on mobile devices.
Expected: every back navigation link is a block-level element.

**CHECK 8 - Status badges with hardcoded colors** [Severity: Medium]
Status badge, tag, or chip elements must use semantic tokens or a centralized badge component, not hardcoded color values.
Expected: 0 matches.

**CHECK 9 - Tab bars missing text wrapping prevention** [Severity: Medium] [web only]
Scope: tab and navigation bar layouts.
Tab/navigation bar links must prevent text wrapping to avoid overflow on narrow viewports.
Expected: all tab links apply no-wrap styling.

**CHECK 10 - Uncontained table full-width** [Severity: Medium] [web only]
Table components using full-width styling must have a width-constrained parent container. Flag only tables whose full-width styling propagates to the viewport edge. Tables inside a constrained container are acceptable.
Expected: 0 uncontained full-width tables.

**CHECK 11 - Horizontal overflow on table wrappers** [Severity: Medium] [web only]
Table wrapper elements with horizontal overflow scrolling must also have a max-width constraint to prevent unbounded scroll on wide viewports.
Exclude: code blocks, comments.
Expected: 0 unbounded horizontal overflow wrappers.

**CHECK 12 - Deprecated or legacy styling syntax** [Severity: High]
Deprecated styling APIs or syntax that will break in newer framework versions must be replaced with current equivalents.
Expected: 0 matches."

---

## Step 3 - Supplemental checks (run in main context, not delegated)

These require judgment, not just pattern matching:

Severity: High for routes with DB queries, Medium for static/client-only routes.

**S1 - Singleton UI element duplication**
Read sidebar/navigation and layout components.
Verify: singleton UI indicators (notification badges, user avatars, global action buttons) appear exactly once in the rendered DOM per viewport. Collapsible sidebar + responsive header can cause double rendering.
Expected: each singleton element renders once regardless of viewport.

**S2 - Destructive action semantic color**
Read components containing destructive actions (sign out, delete, cancel, remove).
Verify: destructive actions use the design system's semantic destructive/danger token, not hardcoded color values.
Expected: semantic destructive token with interactive state variant (hover, pressed, focused).

**S3 - Table container width constraint** [web only]
For each file in scope that contains a table component, verify that its immediate parent container applies a width constraint (content-fit, auto, or max-width). Files with a table but no width constraint on the wrapper → flag.
Expected: all table wrappers use a width constraint.

**S4 - Rendering boundary placement** *(SSR frameworks only - skip for SPAs, CSR-only, and native projects. See reference file for applicable frameworks and directives.)*
Read the main layout file.
Verify: directives that force client-side rendering are NOT placed at the root layout level. The root layout should preserve server-side rendering capability.
Severity: Medium (performance - prevents server rendering optimization).

---

## Step 4 - Produce audit report

Output in this exact format:

```
## UI Audit - [DATE]
### Scope: [N] page files from [SITEMAP_OR_ROUTE_LIST] + [N] component files
### Target: [FULL | target:<value>]

> For accessibility checks (axe-core WCAG scan, APCA contrast, aria/tabindex/label patterns), run `/accessibility-audit`.

### Grep Checks
| # | Check | Matches | Severity | Verdict |
|---|---|---|---|---|
| 1 | Multi-column without responsive breakpoints | N | High | ✅/❌ |
| 2 | Hardcoded colors instead of tokens | N | High | ✅/❌ |
| 3 | Hardcoded dark structural colors | N | Medium | ✅/❌ |
| 4 | Error indicators with hardcoded color | N | Medium | ✅/❌ |
| 5 | Duplicate style tokens | N | Low | ✅/❌ |
| 6 | Bare empty states | N | High | ✅/❌ |
| 7 | Back navigation links display | N | Low | ✅/❌/⊘ |
| 8 | Status badges with hardcoded colors | N | Medium | ✅/❌ |
| 9 | Tab bars missing no-wrap | N | Medium | ✅/❌/⊘ |
| 10 | Uncontained table full-width | N | Medium | ✅/❌/⊘ |
| 11 | Horizontal overflow on table wrappers | N | Medium | ✅/❌/⊘ |
| 12 | Deprecated/legacy styling syntax | N | High | ✅/❌ |

*(⊘ = skipped, web only.)*

### Supplemental Checks
| # | Check | Verdict | Notes |
|---|---|---|---|
| S1 | Singleton UI element duplication | ✅/❌ | |
| S2 | Destructive action semantic color | ✅/❌ | |
| S3 | Table container width constraint | ✅/❌/⊘ | |
| S4 | Rendering boundary placement | ✅/❌/⊘ | |

### ❌ Failures requiring action ([N] total - by severity)

**Critical ([N])** - fix before Phase 6:
[file:line - check# - excerpt - recommended fix]

**High ([N])** - flag in Phase 6 checklist:
[file:line - check# - excerpt - recommended fix]

**Medium/Low ([N])** - persist via the backlog write-once protocol (`.claude/rules/backlog-protocol.md`; session scratch in a block, direct standalone):
[file:line - check# - excerpt - recommended fix]

### ✅ Passing checks ([N] total)
[check numbers with 0 matches confirmed]

### Coverage
Page files checked: N/N from [SITEMAP_OR_ROUTE_LIST]
Component files checked: N
```

If all checks pass: output `UI Audit CLEAN - [DATE]. No violations found.`

---

## Execution notes

- Do NOT make any code changes during this skill. Audit only.
- Do NOT re-read files already in context from Step 1.
- The Explore agent in Step 2 handles all grep work. Do not duplicate searches in the main context.
- **Pipeline integration**: Critical findings block Phase 6 progression per pipeline.md severity handling. Medium/Low findings are persisted to `docs/refactoring-backlog.md` via the backlog write-once protocol (`.claude/rules/backlog-protocol.md`).
- **Concurrent execution**: when invoked from pipeline.md Phase 5d Track A, this skill launches concurrently with the first browser-based skill. It is fully static - no dev server required.
- **Complementary skill**: run `/accessibility-audit` alongside `/ui-audit` for any UI change. It owns axe-core WCAG 2.2 scan, APCA contrast, and static a11y patterns (aria-label, tabindex, form labels, focus visibility, keyboard accessibility). These checks were migrated from this skill during the v2 review cycle.

---

## Pattern reference

All framework-specific grep patterns, verification methods, and platform configuration are in `${CLAUDE_SKILL_DIR}/PATTERNS.md`. Read it in Step 1 before launching the Explore agent.
