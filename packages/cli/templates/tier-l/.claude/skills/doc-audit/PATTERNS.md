# Doc Audit - Patterns

Reference file for `/doc-audit`. Contains the pinned Tierward placeholder list (agnostic) and stack-specific grep patterns for D7 doc-sync checks.
The executing agent reads this file at the start of Step 3. For D3, use the placeholder list verbatim. For D7, select the section matching the detected stack; if the detected stack is not in the top 3 (`node-ts`, `python`, `swift`), skip D7 entirely.

---

## D3 - Tierward placeholder list (agnostic)

The Tierward scaffold emits these placeholder tokens. Readers are expected to replace each one with a concrete value. A token left in place after first-run configuration signals an incomplete adoption, not an intentional user convention.

```
[TEST_COMMAND]
[FRAMEWORK_VALUE]
[LANGUAGE_VALUE]
[INSTALL_COMMAND]
[DEV_COMMAND]
[BUILD_COMMAND]
[TYPE_CHECK_COMMAND]
[E2E_COMMAND]
[ENUM_CASE_CONVENTION]
[MIGRATION_COMMAND]
```

**Extension rule**: this list is grepped against the Tierward template tree (`packages/cli/templates/**`) - only tokens that are actually emitted by the scaffold belong here. When a new Tierward release adds a placeholder to any scaffold template, append it to this list and bump the skill's internal version note in the next release. Generic `[UPPERCASE]` regex is deliberately avoided - it produces false positives on legitimate user conventions (`[API_KEY]`, `[YOUR_DOMAIN]`, `[FEATURE_FLAG]`).

**Exclusion**: skip files under `packages/cli/templates/**` (the Tierward template source itself - placeholders are intentional there). Apply this exclusion only when auditing the Tierward repo itself; in user projects, the exclusion is a no-op.

---

## D7 - Stack-specific doc sync

Best-effort hints, not hard validation. Atypical layouts (custom routing, monorepos, non-conventional directory naming) will produce false positives; default severity for D7 findings is **Medium** so they are discussable rather than blocking.

### node-ts

**Surface A - Next.js routes**

Marker: `next.config.js`, `next.config.mjs`, `next.config.ts`, or `"next"` in `package.json` dependencies.

Route discovery patterns:

```
app/**/page.{ts,tsx,js,jsx}        # App Router (Next.js 13+)
pages/**/*.{ts,tsx,js,jsx}         # Pages Router (legacy)
```

Exclude: `app/api/**`, `pages/api/**`, `_app`, `_document`, `_error`, `layout.*`, `loading.*`, `error.*`, `not-found.*`, `[...catchall]` style dynamic segments.

Compare the derived route list against:
- `docs/sitemap.md` entries (grep for route paths `/<segment>`)
- README "Tech Stack" or "Routes" sections

Flag any route that does not appear in either doc source.

**Surface B - Dependency mentions**

For top-level dependencies in `package.json` (merge `dependencies` and `devDependencies`, exclude `@types/*`), check whether the dependency name appears at least once in README (case-insensitive). Limit to the top 15 by install size if the dep list is > 15. Absence is a Medium orphan.

### python

**Surface A - Django URLconf**

Marker: `manage.py` + any `*/urls.py` OR `django` in `pyproject.toml` / `requirements.txt`.

Route discovery pattern:

```python
path\([\'"]([^\'\"]+)[\'"]
re_path\([\'"]([^\'\"]+)[\'"]
```

Extract the URL pattern (first regex capture). Exclude admin-prefixed routes (`admin/`, `^admin/`) and API-only prefixes declared under `api/v\d+/`.

Compare extracted paths against `docs/sitemap.md` and README. Flag missing paths.

**Surface B - Dependency mentions**

From `pyproject.toml` `[project.dependencies]` or `[tool.poetry.dependencies]`, or top-level entries in `requirements.txt` (exclude version pins `==`, `>=`, `~=` - just the package name). Check whether the package name appears in README. Limit to top 15. Absence is a Medium orphan.

### swift

**Surface A - Package products and targets**

Marker: `Package.swift` in repo root (Swift Package Manager).

Patterns:

```swift
.library\(\s*name:\s*"([^"]+)"
.executable\(\s*name:\s*"([^"]+)"
.target\(\s*name:\s*"([^"]+)"
```

Exclude test targets: any name ending in `Tests` or explicitly declared via `.testTarget`.

Compare the derived product and target list against README. Flag missing entries.

**Surface B - DocC presence**

If `Package.swift` declares at least one `.library(...)` product, check for the presence of a `Docs/`, `docs/`, or `Documentation/` directory. Absence is a Low hint (not Medium): Swift library packages conventionally ship DocC catalogs; absence is worth mentioning but not blocking.

**Surface C - Xcode scheme mentions**

If an `*.xcodeproj` or `*.xcworkspace` exists, the primary scheme name is usually the repo name. No automatic extraction in v1 (would require parsing the Xcode project file format). Deferred.

---

## Notes for future stacks

When adding a new stack to D7 (`node-js`, `go`, `rust`, `kotlin`, `dotnet`, `ruby`, `java`):

1. Add a new section here with Surface A (routes or modules), Surface B (dependencies), Surface C (if applicable).
2. Update the Step 1 announcement in `SKILL.md` to include the stack in the top-3 list.
3. Keep patterns conservative: the goal is to surface high-confidence orphans, not to flag every possible mismatch.
