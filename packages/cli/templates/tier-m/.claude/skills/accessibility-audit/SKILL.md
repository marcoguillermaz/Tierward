---
name: accessibility-audit
description: Unified accessibility audit - axe-core WCAG 2.2 scan, APCA contrast measurement, static a11y checks (aria-label, tabindex, form labels, focus visibility, onClick on non-interactive). Static and live modes.
user-invocable: true
model: sonnet
context: fork
argument-hint: [static|full|wcag] [target:route:<path>|target:file:<glob>|target:role:<role>]
allowed-tools: Read Glob Grep Bash(curl:*) mcp__playwright__browser_navigate mcp__playwright__browser_evaluate mcp__playwright__browser_wait_for Agent Edit Write
---

## Configuration (fill in before first run)

> Replace these placeholders:
> - `[DEV_URL]` - e.g. `http://localhost:3000`
> - `[SITEMAP_OR_ROUTE_LIST]` - e.g. `docs/sitemap.md`
> - `[APP_SOURCE_GLOB]` - e.g. `app/**/page.tsx` + `components/**/*.tsx`, `src/**/*.vue`, `templates/**/*.html`
> - `[DEV_COMMAND]` - e.g. `npm run dev`, `python manage.py runserver`, `swift run`
>
> Then fill in the APCA probe selectors in Step 3 (see Stack adaptation section at end).

Single source of truth for accessibility checks across the project. Combines static grep-based checks (run in all modes) with live browser checks (axe-core WCAG scan + APCA contrast measurement) when a dev server is available.

**Scope boundary**:
- Owns: static a11y patterns (aria, tabindex, labels, focus, keyboard), axe-core WCAG 2.2 scan, APCA contrast computation.
- Not here: design token compliance and component adoption → `/ui-audit`. Typography and aesthetic polish → `/visual-audit`. Viewport-specific a11y (WCAG 1.4.4 resize, 1.4.10 reflow, tap targets) → `/responsive-audit`.

**Two execution modes**:
- **Static mode** (dev server not running): Steps 0-2, 5 only. Can run concurrently with browser-based skills per pipeline.md.
- **Full mode** (dev server running): all steps including APCA contrast + axe-core scan. Sequential - shares the browser MCP session with other live audits.
- **WCAG mode** (`wcag`): same as full, plus axe-core `best-practice` tag.

---

## Step 0 - Target resolution + mode selection

Parse `$ARGUMENTS` for an optional mode keyword and a `target:` token.

| Pattern | Meaning |
|---|---|
| `static` | Force static mode - skip Steps 3-4 even if dev server is available |
| `full` | Force full mode - fail if dev server is unreachable |
| `wcag` | Full mode + axe-core `best-practice` tag (more stringent) |
| No mode keyword | **Auto** - full if dev server responds, else static with a warning |
| `target:route:<path>` | Restrict live scan to a single route (e.g. `target:route:/dashboard`) |
| `target:file:<glob>` | Restrict static checks to matching files (e.g. `target:file:src/**/page.tsx`) |
| `target:role:<role>` | Restrict to routes accessible by that role (from `[SITEMAP_OR_ROUTE_LIST]`) |
| No target argument | Full audit - all page/component files from `[SITEMAP_OR_ROUTE_LIST]` |

**STRICT PARSING - mandatory**: derive mode and target ONLY from explicit text in `$ARGUMENTS`. Do NOT infer from conversation context, recent blocks, or memory. Unknown tokens → treat as absent and announce ignored args in the banner.

Announce: `Running accessibility-audit in [STATIC | FULL | WCAG] mode - scope: [FULL | target: <resolved>]`

---

## Step 1 - Mode detection (if mode is auto)

Run:
```bash
curl -s -o /dev/null -w "%{http_code}" [DEV_URL]
```

- Response 200 or 302 → proceed in **full** mode.
- Anything else → degrade to **static** mode and record in the report: `⚠️ Dev server not reachable at [DEV_URL] - APCA + axe-core checks skipped. Re-run after starting [DEV_COMMAND] for full coverage.`

If mode was forced (`static`/`full`/`wcag`), skip this step - but if `full`/`wcag` was forced and the server is unreachable, fail explicitly: `❌ Mode [full|wcag] requested but dev server not running. Start [DEV_COMMAND] or re-run with "static".`

---

## Step 2 - Static a11y checks (A1-A8)

Read `[SITEMAP_OR_ROUTE_LIST]` (if present) to build the target file list - page files + component files. If no sitemap, fall back to `[APP_SOURCE_GLOB]` filtered by `target:` scope.

Read `${CLAUDE_SKILL_DIR}/CHECKS.md` for severity classification and WCAG references.

Launch a **single Explore subagent** (model: haiku) with the full file list and the check definitions below. Pass file paths explicitly - do not ask the agent to discover them.

> **Ripgrep note**: patterns are written for ripgrep (`rg`). Use `|` for alternation. Character classes work as-is.

### Instructions for the Explore agent

"Run all 8 checks below. For each check: report total match count, list every match as `file:line - excerpt`, and state PASS (0 matches) or FAIL (N matches). If 0 matches, explicitly state '0 matches - PASS'. Do not skip any check.

File scope: use ONLY the files provided.

---

**A1 - Icon-only buttons missing aria-label** [Severity: Critical - WCAG 4.1.2]
Find interactive elements that render only an icon (no visible text content) and lack `aria-label` or `aria-labelledby`.
Use the grep pattern from `[A1_ICON_BUTTON_PATTERN]` in Stack adaptation. Filter out lines already containing `aria-label`.
Expected: 0 matches. Icon-only interactive elements must have an accessible name.

**A2 - Positive tabindex** [Severity: Critical - WCAG 2.4.3]
Pattern: `tabIndex=[1-9]|tabindex="[1-9]`
Exclude: lines with `//`, `{/*`.
Expected: 0 matches. Positive tabindex breaks natural tab order. Only `tabIndex={0}` or `tabIndex={-1}` are valid.

**A3 - Focus outline suppression without compensation** [Severity: High - WCAG 2.4.7]
Pattern: lines containing `outline-none` or `outline: none` that do NOT also contain a focus-visible ring or outline restoration.
Method: grep for outline suppression, then filter out lines that also contain focus restoration patterns (e.g. `focus-visible:ring`, `focus:ring`, `:focus-visible { outline`).
Expected: 0 matches. Suppressing the focus outline without providing an alternative indicator breaks keyboard navigation in high-contrast mode.

**A4 - Native `<img>` without alt** [Severity: Medium - WCAG 1.1.1]
Pattern: `<img\s`
Exclude: lines containing `//`, `{/*`, `alt=`, `.svg`, `data:`, `role="presentation"`.
Expected: 0 matches. Every raster image must have an `alt` attribute (empty string allowed for decorative use with `role="presentation"`).

**A5 - Form inputs without accessible labels** [Severity: Critical - WCAG 1.3.1, 3.3.2, 4.1.2]
Find form controls (input, textarea, select - including framework-specific component names) without an associated label. Association methods: `for`/`htmlFor` matching input `id`, `aria-label`, or `aria-labelledby`.
Use `[A5_FORM_CONTROL_PATTERN]` from Stack adaptation for framework-specific selectors. Check within ±5 lines for label association.
Exclude: inputs inside form field wrapper components with a sibling label component (framework form libraries handle labeling internally).
Expected: 0 matches. Every form control must have an accessible name.

**A6 - Focus indicator too thin** [Severity: High - WCAG 1.4.11]
Pattern: focus ring/outline declarations that rely on a default width without explicit sizing (e.g. bare `focus-visible:ring` without a size like `ring-2`, or `outline-width` under 2px).
Expected: 0 matches on interactive elements. Focus indicators must meet WCAG 1.4.11 (3:1 non-text contrast) - a 1px ring is typically insufficient.

**A7 - onClick on non-interactive elements** [Severity: Critical - WCAG 2.1.1]
Find non-interactive elements (`div`, `span`, `li`, `p`) with click/tap event handlers that lack keyboard accessibility.
Use `[A7_CLICK_HANDLER_PATTERN]` from Stack adaptation for framework-specific event binding syntax.
For each match, verify: (1) `role="button"` or equivalent interactive role present, AND (2) keyboard handler (`onKeyDown`, `@keydown`, `on:keydown`, etc.) present. Missing either = keyboard users cannot activate it.
Exclude: comment lines; headless UI composition wrappers that delegate to child interactive elements.
Expected: 0 matches missing keyboard support.

**A8 - Navigation trigger keyboard accessibility** [Severity: High - WCAG 2.1.1]
Scope: main layout entry point and navigation components.
Verify: the primary navigation trigger is keyboard-reachable at ALL breakpoints - not hidden at certain screen sizes without an alternative.
Use `[A8_NAV_TRIGGER_PATTERN]` and `[A8_RESPONSIVE_HIDE_PATTERN]` from Stack adaptation.
Flag: nav trigger wrapped only in a responsive-hide class with no matching trigger at other breakpoints.
Expected: every layout exposes a keyboard-reachable nav trigger at every breakpoint."

---

## Step 3 - APCA contrast measurement (full/wcag mode only - live)

Pick 3 representative pages from the target scope:
1. The dashboard or root route (`/`)
2. One data-list page (first list route in scope)
3. One form/write page (first form or wizard route in scope)

For each page:

```
1. mcp__playwright__browser_navigate → [DEV_URL]/<route>
2. Ensure logged in with the role from the route's sitemap entry (if auth required).
3. browser_wait_for network idle (2000ms max).
4. For each theme (light, dark):
   - Apply `[THEME_TOGGLE_ACTION]` from Stack adaptation (see Step 5d of `/visual-audit` for detection snippet).
   - browser_wait_for 500ms.
   - Run the APCA probe below via browser_evaluate.
```

### APCA probe

> **Adapt selectors below** to match your project's design system tokens. The defaults target
> common patterns (muted text, card surface, primary CTA, border). See Stack adaptation section.

```js
// Returns computed color + background for the three C-checks.
// APCA Lc is NOT computed here - we capture the raw rgb pairs and flag qualitatively.
// The skill's report narrates the pair against Lc thresholds documented below.
const byClass = (sel) => document.querySelector(sel);

// Adapt these selectors to your design system (see Stack adaptation section)
const muted = byClass('[MUTED_TEXT_SELECTOR]');
const card = byClass('[CARD_SURFACE_SELECTOR]');
const cta = byClass('[PRIMARY_CTA_SELECTOR]');
const border = byClass('[BORDER_SELECTOR]');

const style = (el) => el ? getComputedStyle(el) : null;
return {
  theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  mutedOnCard: {
    color: muted ? style(muted).color : null,
    background: card ? style(card).backgroundColor : null
  },
  ctaOnBrand: {
    color: cta ? style(cta).color : null,
    background: cta ? style(cta).backgroundColor : null
  },
  borderOnBg: {
    color: border ? style(border).borderColor : null,
    background: card ? style(card).backgroundColor : null
  }
};
```

See `${CLAUDE_SKILL_DIR}/CHECKS.md` for APCA thresholds (Lc 75/60/45/15) and C1-C3 severity classification.

Record each rgb pair. The report narrates against thresholds qualitatively (getComputedStyle returns resolved rgb, not Lc - final verdict combines the rgb with visible contrast in the screenshot when available).

---

## Step 4 - axe-core browser scan (full/wcag mode only - live)

For each of the 3 pages from Step 3:

```js
// Inject axe-core from CDN
await new Promise((resolve, reject) => {
  const s = document.createElement('script');
  s.src = '[AXE_CORE_CDN_URL]'; // default: https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js - update in Stack adaptation
  s.onload = resolve;
  s.onerror = reject;
  document.head.appendChild(s);
});

// WCAG 2a / 2aa / 2.1aa / 2.2aa (+ best-practice in wcag mode)
const tags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
// In wcag mode, also push 'best-practice'

const results = await axe.run(document, {
  runOnly: { type: 'tag', values: tags },
  reporter: 'v2'
});

return {
  violations: results.violations.map(v => ({
    id: v.id,
    impact: v.impact,
    description: v.description,
    nodes: v.nodes.length,
    example: v.nodes[0]?.html?.slice(0, 120)
  })),
  passes: results.passes.length,
  incomplete: results.incomplete.length
};
```

See `${CLAUDE_SKILL_DIR}/CHECKS.md` for axe severity mapping (X1-X3) and known false positive suppression guidance.

---

## Step 5 - Report and backlog decision gate

### Output format

```
## Accessibility Audit - [DATE] - [MODE] - [TARGET]

### Executive summary
[2-5 bullets - Critical and High findings only. Write concrete facts: file:line, check ID, impact.
If nothing Critical/High: "No Critical or High findings - a11y posture is clean for the audited scope."
Examples:
- "A5 Critical: 3 form inputs in [settings page file] have no accessible label"
- "C1 High: secondary text on surface background rgb(…) on dark theme - likely below Lc 45"
- "X1 Critical: 'button-name' axe violation on /dashboard - 2 nodes"]

### A11y maturity assessment
| Dimension | Rating | Notes |
|---|---|---|
| Keyboard access | strong / adequate / weak | [A2, A3, A6, A7, A8 results] |
| Accessible naming | strong / adequate / weak | [A1, A4, A5 results] |
| Contrast posture | strong / adequate / weak | [C1, C2, C3 - or "skipped, static mode"] |
| WCAG conformance | strong / adequate / weak | [axe-core X1/X2/X3 counts, or "skipped"] |
| Coverage | full / partial / static-only | [which steps ran] |

### Per-check verdicts

Static (all modes):
| # | Check | Matches | Severity | Verdict |
|---|---|---|---|---|
| A1 | Icon-only buttons missing aria-label | N | Critical | ✅/❌ |
| A2 | Positive tabindex | N | Critical | ✅/❌ |
| A3 | outline-none without focus-ring compensation | N | High | ✅/❌ |
| A4 | Native <img> without alt | N | Medium | ✅/❌ |
| A5 | Form inputs without accessible labels | N | Critical | ✅/❌ |
| A6 | Bare focus ring without explicit size | N | High | ✅/❌ |
| A7 | onClick on non-interactive elements | N | Critical | ✅/❌ |
| A8 | Navigation trigger keyboard accessibility | N | High | ✅/❌ |

Live (full/wcag mode only - else "Skipped - static mode"):
| # | Check | Result | Severity | Verdict |
|---|---|---|---|---|
| C1 | Secondary text on surface background (both themes) | [rgb pair / Lc estimate] | High / Critical | ✅/⚠️/❌ |
| C2 | CTA text on brand background | [rgb pair] | High | ✅/❌ |
| C3 | Border / icon vs card bg | [rgb pair] | Medium | ✅/❌ |

axe-core (full/wcag mode only):
| Page | Critical | Serious | Moderate | Minor | Passes |
|---|---|---|---|---|---|
| / | N | N | N | N | N |
| /[list-page] | N | N | N | N | N |
| /[form-page] | N | N | N | N | N |

Top axe violations:
[id - description - N nodes - example HTML]

### Prioritized findings
For each finding with severity Medium or above:
[SEVERITY] [A11Y-?] [check ID] - [file:line or route] - [evidence] - [fix] - [effort: S=<1h / M=half day / L=day+]

### Quick wins
[Findings that meet all three: (a) Medium or High, (b) effort S, (c) single-file fix]
Format: "A11Y-[n]: [one-line description]"
If no quick wins: state explicitly.
```

### Backlog decision gate

Present all findings with severity Medium or above as a numbered decision list, sorted Critical → High → Medium:

```
Found N a11y findings at Medium or above. Which to add to backlog?

[1] [CRITICAL] A11Y-? - [check ID] - file:line - one-line description
[2] [HIGH]     A11Y-? - [check ID] - file:line - one-line description
[3] [MEDIUM]   A11Y-? - [check ID] - file:line - one-line description
...

Reply with numbers to include (e.g. "1 2 4"), "all", or "none".
```

**Wait for explicit user response before writing anything.**

Then persist ONLY the approved entries via the backlog write-once protocol (`.claude/rules/backlog-protocol.md`) — in an active block append them to the session scratch; standalone, write them directly to `docs/refactoring-backlog.md`. Use the same entry format either way:
- Assign ID: `A11Y-[n]` (next available after existing A11Y entries)
- Add row to priority index
- Add full detail section with: issue, evidence (file:line or rgb pair), check ID, fix suggestion, effort, WCAG reference

### Severity guide

See `${CLAUDE_SKILL_DIR}/CHECKS.md` → Overall severity classification for the full mapping (A1-A8 static, C1-C3 live, X1-X3 axe-core).

---

## Execution notes

- Do NOT apply a11y fixes during this skill. Audit only.
- The Explore agent in Step 2 handles all static grep work. Do not duplicate searches in the main context.
- **Concurrent execution**: when invoked from pipeline.md Phase 5d Track A, this skill runs sequentially with `/visual-audit` → `/ux-audit` → `/responsive-audit` - they share the browser MCP session. `/ui-audit` still launches concurrently first.
- **Static mode degradation**: if the dev server is unreachable and mode was auto, the report must state explicitly which steps were skipped. Never silently omit checks.
- **axe-core false positives**: document suppressed false positives explicitly in the report. Do not flag patterns managed by headless UI libraries (inert Dialog children, Portal color-contrast measurements) as violations without manual verification.
- **Complementary skills**: `/accessibility-audit` is the single source of truth for accessibility. For design-token compliance and component adoption see `/ui-audit`; for aesthetic contrast and polish see `/visual-audit`; for viewport-specific WCAG checks (1.4.4 resize, 1.4.10 reflow, tap targets) see `/responsive-audit`.

---

## Stack adaptation (fill after scaffold)

| Key | Your value | Examples |
|---|---|---|
| `[DEV_URL]` | | `http://localhost:3000`, `http://127.0.0.1:8080` |
| `[SITEMAP_OR_ROUTE_LIST]` | | `docs/sitemap.md`, `docs/routes.md` |
| `[APP_SOURCE_GLOB]` | | `app/**/page.tsx`, `src/**/*.vue`, `templates/**/*.html` |
| `[DEV_COMMAND]` | | `npm run dev`, `python manage.py runserver`, `swift run` |
| **APCA selectors** | | Adapt Step 3 probe to your design system tokens |
| `[MUTED_TEXT_SELECTOR]` | | `.text-secondary`, `[class*="text-muted"]`, `[class*="muted-foreground"]` |
| `[CARD_SURFACE_SELECTOR]` | | `.card`, `article`, `[role="article"]`, `main > div` |
| `[PRIMARY_CTA_SELECTOR]` | | `.btn-primary`, `[data-variant="primary"]`, `button[class*="bg-primary"]` |
| `[BORDER_SELECTOR]` | | `[class*="border"]`, `.border`, `hr` |
| `[AXE_CORE_CDN_URL]` | | `https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js` |
| `[THEME_TOGGLE_ACTION]` | | See `/visual-audit` Stack adaptation - shared key |
| **Static check patterns** | | Adapt grep patterns to your UI framework |
| `[A1_ICON_BUTTON_PATTERN]` | | React: `size="icon"\|size={'icon'}`, Vue: `:icon="true"`, generic: `<button[^>]*>\s*<(svg\|img\|i)\b` |
| `[A5_FORM_CONTROL_PATTERN]` | | React: `<input\|<Input\|<textarea\|htmlFor`, Vue: `v-model\|<el-input`, generic: `<input\|<textarea\|<select` |
| `[A7_CLICK_HANDLER_PATTERN]` | | React: `onClick`, Vue: `@click\|v-on:click`, Svelte: `on:click`, Angular: `(click)` |
| `[A8_NAV_TRIGGER_PATTERN]` | | React/shadcn: `SidebarTrigger`, generic: nav trigger component name |
| `[A8_RESPONSIVE_HIDE_PATTERN]` | | Tailwind: `md:hidden`, Bootstrap: `d-none d-md-block`, generic: `@media` hide |
