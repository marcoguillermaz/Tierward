# /accessibility-audit

> Unified accessibility audit - axe-core WCAG 2.2 scan, APCA contrast measurement, static a11y checks (aria-label, tabindex, form labels, focus visibility, onClick on non-interactive). Static and live modes.

| Tiers | Model | Flags |
|---|---|---|
| Tier M · Tier L | Sonnet | `[static|full|wcag] [target:route:&lt;path&gt;|target:file:&lt;glob&gt;|target:role:&lt;role&gt;]` |

---

## Dove e quando

Run before any public release or after significant UI changes, especially when adding forms, modals, or interactive widgets. Static analysis via aria, tabindex, focus, and label checks catches the majority of screen-reader and keyboard-navigation failures without requiring a browser session.

## Output atteso

A WCAG 2.2 conformance report with findings grouped by success criterion, each tagged with impact level (critical / serious / moderate / minor). APCA contrast failures include the measured ratio and the required minimum. A typical finding: an icon button with no accessible label, rated critical for screen-reader users.
