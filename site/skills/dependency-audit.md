# /dependency-audit

> Dependency update audit. Inventories outdated packages, classifies into Tier A (safe patch+minor), Tier B (non-core major), Tier C (core/breaking-risk). Fetches changelogs for breaking-change candidates, greps the codebase for consumed APIs to evaluate impact, checks the test baseline, and produces a decision report (apply/defer/escalate per package). Also checks runtime version vs current LTS. Stack-aware via sibling PATTERNS.md (node-ts, python, swift in v1; other stacks fall back to agnostic rules). Audit-only — never modifies package.json or lockfiles in v1.

| Tiers | Model | Flags |
|---|---|---|
| Tier M · Tier L | Sonnet | `[tier:A|tier:B|tier:C|pkg:&lt;name&gt;]` |

---

## Dove e quando

Run on a regular cadence (weekly or before a release) to identify outdated dependencies and understand the risk of upgrading. The Tier A/B/C classification lets teams batch safe upgrades automatically while reviewing breaking-change candidates manually.

## Output atteso

A tiered dependency report: Tier A (patch and minor, safe to batch), Tier B (major, non-core), and Tier C (major, core or high breaking-change risk). Each entry includes current and latest version, and changelog highlights. A typical Tier C finding: a major ORM upgrade with breaking query API changes affecting fifteen files.
