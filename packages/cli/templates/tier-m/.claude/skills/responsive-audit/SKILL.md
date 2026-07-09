---
name: responsive-audit
description: Responsive audit: test pages at 375/768/1024px breakpoints via Playwright. Checks overflow, tap targets, sidebar collapse, text reflow, WCAG 1.4.4 zoom.
user-invocable: true
model: opus
context: fork
argument-hint: [quick|full|wcag] [target:page:<route>|target:role:<role>|target:section:<section>]
allowed-tools: Read Glob Grep Bash(rm:*) mcp__playwright__browser_navigate mcp__playwright__browser_resize mcp__playwright__browser_take_screenshot mcp__playwright__browser_snapshot mcp__playwright__browser_type mcp__playwright__browser_click mcp__playwright__browser_wait_for mcp__playwright__browser_evaluate
---

## Configuration (fill in before first run)

> Replace these placeholders:
> - `[DEV_URL]` - e.g. `http://localhost:3000`
> - `[LOGIN_ROUTE]` - your login page path, e.g. `login`, `signin`, `auth/login`
> - `[SITEMAP_OR_ROUTE_LIST]` - e.g. `docs/sitemap.md` or `docs/routes.md`
> - `[MOBILE_ROUTES]` - comma-separated routes to test in quick mode (pick 4–6 most-used)
> - `[TEST_ACCOUNTS]` - one or more `email / password` pairs per role (from your project's test accounts)
> - `[DEV_COMMAND]` - e.g. `npm run dev`, `pnpm dev`
> - `[APP_SOURCE_GLOB]` - e.g. `src/**/*.{tsx,jsx}`, `app/**/*.{vue,svelte}`, `templates/**/*.html`
> - `[SCOPE_NOTE]` - which roles/pages are in scope vs excluded
>
> If `[DEV_URL]` or `[SITEMAP_OR_ROUTE_LIST]` is not filled, the skill reports an error and exits.

## Step 0 - Mode + target detection

Parse `$ARGUMENTS`:

**Mode** (controls breakpoints, route breadth, and WCAG checks):
- `quick` (or empty) → BP1 (375px) only, key routes per role. No WCAG checks.
- `full` → all breakpoints (375px + 768px + 1024px), all R-flagged routes. No WCAG checks.
- `wcag` → adds BP0 (320px) to the active breakpoint set + WCAG 1.4.4 resize text step (Step 5b). Stackable: `full wcag` = all breakpoints + WCAG compliance checks.

**Target** (filters the route list - applied on top of mode):
- `target:role:<role_name>` → routes accessible by that role only
- `target:section:<name>` → routes whose path contains `<name>`
- No target → NO filter - ALL R-flagged routes from `[SITEMAP_OR_ROUTE_LIST]` per the selected mode

**STRICT PARSING - mandatory**: derive mode and target ONLY from the explicit text in `$ARGUMENTS`. Do NOT infer target from conversation context, recent work, active block names, or project memory. If `$ARGUMENTS` contains no `target:` token → apply NO filter (all R-flagged routes per the selected mode).

**Target scoping - comparative vs independent checks (mandatory):** some audit skills contain *comparative* checks that derive a project-wide convention by counting usage across the whole inventory - those must ignore the `target:` filter. This skill has none: every check tests a route, breakpoint, or file against an absolute threshold (WCAG 1.4.10 reflow at 320px, 44px tap targets, 8px spacing, WCAG 1.4.4 at 200%).
- **Comparative checks - full-project by design; the `target:` filter does NOT apply to them:** none. No check derives its baseline by counting across the route inventory.
- **Independent checks - target-safe:** all checks (S1-S3 static pre-checks, R1-R9 breakpoint checks, VR1-VR6 visual checks, Step 5b WCAG 1.4.4) evaluate one route/file in isolation and safely honor the `target:` filter.
- When a `target:` is given: apply the filter to the working route list (Step 1) and to the static pre-check file scope; no check runs outside the target scope, and the report states the audited scope explicitly.

Announce at start:
`Running responsive-audit in [QUICK | FULL | WCAG] mode - scope: [FULL | target: <resolved description>]`

---

## Step 1 - Load reference

Read `[SITEMAP_OR_ROUTE_LIST]`. Extract:
- All routes with `R` in the Audit column (group by role)
- Test accounts from the test accounts section
- Sub-hierarchy notes (tabs, states, responsive notes)

Apply target filter from Step 0 to produce the **working route list**.

Hold in working memory:
- Working route list grouped by role session needed
- Responsive notes per page (from sitemap sub-hierarchies)

---

## Step 1.5 - Static pre-checks

Run **before** launching the browser. These are zero-cost static checks that catch common patterns:

**S1 - Viewport unit font trap**
Scope: `[APP_SOURCE_GLOB]`. Flag any `vw`-based font size without a `calc()` fallback - disables user zoom (WCAG 1.4.4 violation). Pattern: see CHECKS.md S1.
Expected: 0 matches. Any match is Medium severity.

**S2 - overflow:hidden on html/body**
Scope: global stylesheet + root layout + `[APP_SOURCE_GLOB]` CSS files. Flag `overflow: hidden` on `<html>` or `<body>` - masks scroll symptoms and breaks `position: sticky`. Pattern: see CHECKS.md S2.
Expected: 0 matches. Any match is Medium severity.

**S3 - Images without responsive width constraint**
Scope: `[APP_SOURCE_GLOB]`. All images must have a responsive width constraint (`max-width`, `width: 100%`, or framework equivalent). Flag `<img>` tags missing such a constraint. Pattern: see CHECKS.md S3 - adapt to your stack.
Expected: 0 matches. Any match is Low severity.

Log results as "Static pre-checks: S1 [PASS/FAIL N] · S2 [PASS/FAIL N] · S3 [PASS/FAIL N]" before proceeding.

---

## Step 2 - Pre-flight check

Navigate to `[DEV_URL]`. If not reachable:
> ❌ Dev server not running. Start with `[DEV_COMMAND]` then re-run `/responsive-audit`.

Record the base URL.

---

## Step 3 - Breakpoint definitions

| ID | Width | Height | Label | When active |
|---|---|---|---|---|
| BP0 | 320px | 568px | WCAG Reflow (iPhone 5) | `wcag` mode only |
| BP1 | 375px | 812px | Mobile S (iPhone SE) | Always (quick + full + wcag) |
| BP2 | 768px | 1024px | Tablet (iPad) | `full` + `wcag full` only |
| BP3 | 1024px | 768px | Laptop S | `full` + `wcag full` only |

Quick mode: BP1 only.
Full mode: BP1 + BP2 + BP3.
WCAG mode (any): prepends BP0 to the active set.

**WCAG reference:**
- BP0 (320px) = WCAG 2.2 SC 1.4.10 Reflow threshold - vertical-scrolling content must not require horizontal scroll at 320 CSS pixel width
- BP1 (375px) = real device baseline - not a WCAG threshold but the most common small mobile viewport

---

## Step 4 - Route matrix

Apply the working route list from Step 1 (already filtered by target).

**The definitive route list and per-route notes come from `[SITEMAP_OR_ROUTE_LIST]`** (Step 1). The examples below show the annotation format - do not treat them as an exhaustive or fixed list.

For each route: check the sitemap's tabs/states and sub-hierarchy sections for tabs, sections, and components to verify at each breakpoint.

### Per-role session routes

Group routes by the role session needed. For each role defined in the project:
- Include all routes with that role and `R` in the Audit column
- Note tabs and multi-section layouts from sitemap sub-hierarchies
- **Prerequisite**: if a test account for a role does not exist, skip that session block and log: "[Role] routes SKIPPED - test account not found. Create it before running this section."

### Shared routes (test with first role session - already logged in)
Routes accessible to multiple roles - verify once with the first role session.

---

## Step 5 - Screenshot loop

For each session × route × breakpoint:

1. `browser_resize(width, height)` - set viewport
2. `browser_navigate(url)`
3. Wait 1500ms or until main content visible
4. **DOM preflight validation** - run the preflight script from CHECKS.md § Preflight.
   If `hasMain === false` OR `noError === false`:
   > ⚠️ Route [route] @ BP[N] failed preflight. Skipping - record as WARN in report.
   If `vpWidth` does not match the requested width: log the discrepancy and proceed anyway.
6. **Overflow check** - run the overflow script from CHECKS.md § Overflow. Returns `hasHorizontalScroll`, `overflowPx`, `offendingElements`, `tableOverflows`.
7. **Tap target check** (BP0 + BP1 only) - run the tap-target script from CHECKS.md § Tap target. Returns `tooSmall` (elements under 44px) and `spacingViolations` (pairs with gap < 8px).
8. **Sidebar/nav collapse check** (BP0 + BP1 only) - run the sidebar script from CHECKS.md § Sidebar. Returns `sidebarFound`, `sidebarVisibleAtMobile`, `hamburgerFound`.
9. `browser_snapshot` - ARIA snapshot for structural check

### Checks per screenshot

**R1 - Horizontal overflow**
`hasHorizontalScroll === true` → FAIL. Report `overflowPx` px overflow. Report `offendingElements` from the overflow check query above.
At BP0: any horizontal scroll = WCAG 1.4.10 violation → FAIL (Critical).

**R2 - Table overflow**
From `tableOverflows` array:
- `hasScrollWrapper === false` AND `overflowPx > 0` → FAIL (raw table overflow, no scroll container)
- `hasScrollWrapper === true` AND `overflowPx > 0` → WARN (deliberate scroll container present - verify scroll affordance is visible to user)
Report the specific table class and overflow amount.

**R3 - Text truncation (visual check)**
From screenshot: flag ALL of the following:
- Text cut at viewport edge (not intentional `line-clamp`) → FAIL
- Labels that wrap across 2+ lines breaking the label/value pairing visually → WARN
- Any heading or title that wraps to 3+ lines due to font size disproportionate to the viewport width → WARN
Intentional `line-clamp` on long body text (e.g. descriptions, notes) is acceptable - only flag when the truncation hides operationally critical content.

**R4 - Tap target size** (BP0 + BP1 only)
From `tooSmall` array: flag elements with `w < 44 OR h < 44`.
Exclude: inline text links inside paragraphs, pagination numbers.
Focus on: sidebar nav items, form submit buttons, tab bar items, action buttons in tables.
Note: 44px is the minimum threshold (Apple HIG). Elements between 44-47px pass but do not meet the 48px Material Design recommendation - log as WARN if widespread.

**R5 - Stacked layout**
At BP1: multi-column grid/flex containers should collapse to single column at mobile width. Check from screenshot - if columns do not stack, flag.
Verify that stacked cells have sufficient height and padding - stacking without spacing adjustments produces visually compressed rows.

**R6 - Modal/dialog usability**
If a Dialog is triggered: verify it does not overflow the viewport, has visible close affordance, and the confirm button is reachable without scrolling.

**R7 - Calendar grids and dense multi-section layouts**
At BP0/BP1: any day/week calendar grid (7-column grids are high-risk at 320-375px) - verify it fits within the viewport without horizontal overflow.
At BP0/BP1: pages with 3+ distinct stacked content sections - verify section headers do not overlap when stacking and content remains readable.

**R8 - Tap target spacing** (BP0 + BP1 only)
From `spacingViolations` array: flag pairs of interactive elements with gap < 8px.
8px minimum spacing between touch targets - web.dev / Material Design 3 standard.
Severity: WARN for occasional violations, FAIL if widespread on a primary flow (e.g. all table row action buttons touching).

**R9 - Sidebar/nav collapse** (BP0 + BP1 only)
From sidebar check:
- `sidebarFound === true` AND `sidebarVisibleAtMobile === true` → FAIL. Desktop sidebar must collapse at mobile - if visible, it covers content area.
- `sidebarFound === true` AND `sidebarVisibleAtMobile === false` AND `hamburgerFound === false` → WARN. Sidebar hidden but no visible mobile nav trigger found - user cannot navigate.
- `sidebarFound === true` AND `sidebarVisibleAtMobile === false` AND `hamburgerFound === true` → PASS.
- `sidebarFound === false` → log as "no sidebar detected" - verify visually from screenshot.

---

### Visual responsiveness checks (Opus screenshot analysis - BP0 + BP1 only)

Apply to EVERY screenshot at mobile breakpoints. These are pure visual checks - no DOM queries. They are page-agnostic and apply equally to dashboards, forms, lists, detail pages, and content pages.

**VR1 - Hero / header section reflow**
If the page has a header or hero section (greeting, profile card, page title + metadata, avatar + name + date): does it reflow gracefully at 375px?
Check for:
- Multi-column layout in the header that has not collapsed to vertical stack at mobile
- Secondary elements (date, role badge, metadata) floating without clear visual anchor
- Avatar or icon competing for horizontal space with text content causing awkward wrapping
Severity: FAIL if the header is visually broken or creates a confusing hierarchy. WARN if layout is intact but sub-optimal (e.g. wastes vertical space).

**VR2 - Card content density**
In any card, KPI tile, or list cell: are all labels, values, and subtitles readable at this viewport width?
Check for:
- Labels that are truncated with "..." where the truncated portion contains operationally important information
- Label/value pairs where the value wraps unexpectedly below the label, breaking the intended two-line structure
- Cards so narrow that font-size, padding, and content no longer fit proportionally
Severity: FAIL if content is unreadable or identifying information is lost. WARN if visual polish is degraded.

**VR3 - Typography proportionality**
Is the font size distribution proportional to the 375px viewport?
Check for:
- Any heading that consumes 3+ lines, dominating the viewport and pushing content below fold
- Any body or label text that appears smaller than approximately 14px (visually too small to read comfortably on mobile)
- Inconsistent text sizes within the same section (e.g. two adjacent labels at noticeably different sizes) that break visual rhythm
Severity: WARN.

**VR4 - Primary CTA above fold**
Is the primary action for this page (submit button, main CTA, primary navigation link) visible within the first viewport height (~812px at BP1) without scrolling?
Exception: pages that are explicitly long-form (wizard steps, long forms) - the primary CTA at the bottom of a form is expected. Flag only if the CTA is non-obvious or the page appears to have no visible primary action above fold.
Severity: WARN.

**VR5 - Grid density at mobile**
Any 2-column grid at 375px: are each of the cells visually readable? Minimum readable card width at 375px: ~140px.
Check for:
- Cells with labels that wrap or are cut off because the cell is too narrow
- Numeric values or icons that appear crowded within their cell
- Chip/badge rows that overflow or wrap in a way that breaks the grid rhythm
Severity: FAIL if content is unreadable. WARN if layout is intact but visually crowded.

**VR6 - Content hierarchy at mobile**
Does the page have a clear visual hierarchy at 375px? The most important content should be immediately visible; secondary content below.
Check for:
- Decorative or secondary sections (empty state illustrations, informational banners) appearing above primary content
- Sections with no visible content at 375px (collapsed but no visible affordance to expand)
- Equal visual weight between primary and secondary sections (no clear focus point)
Severity: WARN.

Severity scale for visual checks: **FAIL** = layout is broken or content is unreadable → fix before Phase 6. **WARN** = layout is functional but visually sub-optimal → flag in report, fix in dedicated UI improvement block.

---

## Step 5b - WCAG 1.4.4 Resize Text check (wcag mode only)

**Skip this step if `wcag` flag was not set.**

Select 3 representative routes (one per role, all from the working route list): ideally a form-heavy page, a table-heavy page, and a content page.

For each:
1. `browser_resize(1280, 800)` - desktop viewport
2. `browser_navigate(url)`
3. Apply 200% font size via the resize script from CHECKS.md § WCAG 1.4.4 resize text.
4. Wait 500ms for reflow
5. Run overflow check (same script as Step 5 item 6)
6. Check:
   - `hasHorizontalScroll === true` → FAIL - WCAG 1.4.4 violation. Content lost or broken at 200% text size.
   - Any interactive element no longer reachable (visually clipped) → FAIL
   - Minor reflow/wrap changes → PASS (expected and acceptable)
7. Reset font size (see CHECKS.md)

Log results in the WCAG compliance section of the report.

---

## Step 6 - Session management

### Login helper (reuse across steps)
```
1. browser_navigate [DEV_URL]/[LOGIN_ROUTE]
2. If already at / (session active): check current role matches needed role
   - If wrong role: sign out → wait for login page
3. browser_type [email field] [email from [TEST_ACCOUNTS]]
4. browser_type [password field] [password from [TEST_ACCOUNTS]]
5. browser_click [submit button]
6. browser_wait_for url = [DEV_URL]/
```

### Role switch
1. `browser_navigate [DEV_URL]/[LOGIN_ROUTE]`
2. If redirected to `/`: sign out → wait for login page
3. Login with target credentials

---

## Step 7 - Report

```
## Responsive Audit - [DATE] - [MODE] - [TARGET]
### Reference: [SITEMAP_OR_ROUTE_LIST] (R-flagged routes)
### Breakpoints tested: [BP0 320px (WCAG) · ] BP1 375px [· BP2 768px · BP3 1024px]

### Static pre-checks
| Check | Result | Detail |
|---|---|---|
| S1 - vw font trap | PASS/FAIL N | [matches if any] |
| S2 - overflow:hidden on html/body | PASS/FAIL N | [matches if any] |
| S3 - Images without max-width | PASS/FAIL N | [matches if any] |

### Route matrix

| Route | Role | BP0 320px | BP1 375px | BP2 768px | BP3 1024px | Issues |
|---|---|---|---|---|---|---|
| [route] | [role] | WCAG✅/❌ | PASS/WARN/FAIL | PASS/WARN/FAIL | PASS/WARN/FAIL | [description] |
| ... | | | | | | |

Legend: PASS = no issues · WARN = minor (scroll container present, 44-47px targets, preflight skipped) · FAIL = broken (overflow, truncation, unusable layout) · WCAG✅ = passes 1.4.10 reflow · WCAG❌ = fails 1.4.10

### Violations detail

For each WARN or FAIL:
- **Route**: [url] - **Role**: [role] - **Breakpoint**: [bp]
- **Check**: R[N] or VR[N] - [check name]
- **Detail**: [description - for R1/R2: include overflowPx and offendingElements; for R8: gap values; for R9: sidebar state; for VR checks: describe exactly what was observed in the screenshot]
- **Screenshot**: [filename]
- **Fix hint**: [suggested CSS fix or layout change]

### WCAG compliance (wcag mode only)

| Criterion | Check | Routes tested | Result |
|---|---|---|---|
| 1.4.10 Reflow | No horizontal scroll at 320px | All BP0 routes | PASS/FAIL N |
| 1.4.4 Resize Text | No content loss at 200% zoom | [3 routes sampled] | PASS/FAIL N |

### Clean routes
[List of PASS routes with one-line confirmation]

### Skipped routes
[List routes skipped due to missing test accounts or preflight failures]

### Responsive score
- Total routes tested: N
- PASS: N (N%) · WARN: N · FAIL: N
- Critical (WCAG 1.4.10 violations at BP0): N
- Static pre-check issues: S1 N · S2 N · S3 N
```

---

## Step 8 - Final offer

After the report:

> "Want me to fix the responsive violations found? I can work on:
> - Everything at once
> - By breakpoint: mobile (BP0+BP1) · tablet (BP2) · laptop (BP3)
> - By check: overflow (R1+R2) · tap target (R4+R8) · layout stacking (R5) · sidebar collapse (R9) · modal (R6) · calendar/grid (R7)
> - By section: use `target:section:<name>` on the next run
> - WCAG compliance pass: fix the 1.4.10 and 1.4.4 violations found in `wcag` mode"

**Do NOT apply any changes until confirmed.**

---

## Step 9 - Screenshot cleanup

After the report is delivered, delete any screenshots taken during analysis with `rm`. Run unconditionally at session end.
