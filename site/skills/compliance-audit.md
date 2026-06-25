# /compliance-audit

> Static compliance audit with regulatory profiles. v1.14 ships GDPR profile (data subject rights, lawful basis, security measures, accountability). SOC 2 and HIPAA profiles scaffolded as future-markers in PROFILES.md - enable in v1.15+. Stack-agnostic.

| Tiers | Model | Flags |
|---|---|---|
| Tier M · Tier L | Sonnet | `[target:path:&lt;dir&gt;|profile:gdpr|mode:all]` |

---

## Dove e quando

Run before a compliance review, when onboarding a new data category, or when legal requests a GDPR readiness assessment. The GDPR profile is the default target; SOC 2 and HIPAA scaffolds are available when the project scope requires them.

## Output atteso

A compliance gap report covering identified PII fields, missing data-subject rights handlers, consent management gaps, encryption-at-rest status, retention policy coverage, and undocumented sub-processors. A typical finding: a user email stored in an analytics event log with no documented retention policy or deletion pathway.
