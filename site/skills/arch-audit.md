# /arch-audit

> Audit Claude Code architecture files against Anthropic docs and release notes, and verify internal ecosystem consistency. Run weekly to maintain compliance, catch new features, and keep the context system clean.

| Tiers | Model | Flags |
|---|---|---|
| Tier M · Tier S · Tier L | Sonnet | — |

---

## Dove e quando

Run this after upgrading Claude Code, after Anthropic releases new documentation, or before a major release to confirm that CLAUDE.md and plugin.json are not using deprecated patterns. Useful for any maintainer who needs confidence that the project's context system matches current platform expectations.

## Output atteso

A structured report listing each architecture file checked, with PASS/WARN/FAIL status per item. Auto-fixes are applied directly when a safe substitution exists. A typical finding: a deprecated model ID in settings.json replaced with its current alias.
