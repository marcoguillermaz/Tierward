# /test-audit

> Static test-suite quality audit - coverage from lcov/Istanbul/Cobertura/go/tarpaulin reports, pyramid shape (unit/integration/e2e ratio), anti-patterns (.only leaks, skipped tests, no-assertion tests, hardcoded sleeps). Stack-aware across 11 supported stacks.

| Tiers | Model | Flags |
|---|---|---|
| Tier M · Tier L | Sonnet | `[target:path:&lt;dir&gt;|target:file:&lt;glob&gt;|target:coverage:&lt;path&gt;|mode:all]` |

---

## Dove e quando

Run when coverage reports look healthy but confidence in the test suite is low, or before a refactor to understand which areas have no safety net. The anti-pattern detection catches `.only` leaks, skipped tests, and assertion-free tests that inflate coverage metrics without providing real protection.

## Output atteso

A report with overall coverage by layer, pyramid shape assessment (unit / integration / e2e ratio), and a list of anti-pattern instances with file and line number. A typical finding: twelve test files with no assertions that contribute 8% to the reported line coverage while providing zero protection.
