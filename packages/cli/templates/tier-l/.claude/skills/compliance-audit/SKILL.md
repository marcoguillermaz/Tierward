---
name: compliance-audit
description: Static compliance audit with regulatory profiles. v1.14 ships GDPR profile (data subject rights, lawful basis, security measures, accountability). SOC 2 and HIPAA profiles scaffolded as future-markers in PROFILES.md - enable in v1.15+. Stack-agnostic.
user-invocable: true
model: sonnet
context: fork
argument-hint: [target:path:<dir>|profile:gdpr|mode:all]
allowed-tools: Read Glob Grep
---

## Scope for v1

- **Static analysis only.** Grep, filesystem reads, configuration parsing. Does not run tests, does not connect to databases, does not validate live policy enforcement.
- **Regulatory scope, not legal advice.** This skill flags mechanical gaps between common regulatory expectations and the codebase. It does not produce legal-grade compliance attestation - that requires human counsel review.
- **Active profile: GDPR only.** SOC 2 and HIPAA are scaffolded in `PROFILES.md` with check-ID placeholders and will be enabled once real enterprise feedback validates the patterns. Enabling before validation risks false confidence.

---

## Configuration (adapt before first run)

> Replace these placeholders:
> - `[APP_SOURCE_PATH]` - application source root (e.g. `src/`, `app/`, `lib/`)
> - `[API_ROUTES_PATH]` - API route handlers (e.g. `src/routes/`, `app/api/`)
> - `[SCHEMA_PATH]` - DB schema or ORM model files (e.g. `prisma/schema.prisma`, `src/models/`, `app/models.py`)
> - `[PRIVACY_DOC_PATH]` - privacy policy and data-handling docs (e.g. `docs/privacy/`, `PRIVACY.md`). Leave empty if none.

---

## Step 0 - Target and profile resolution

Parse `$ARGUMENTS` for `target:` or `profile:` tokens.

| Pattern | Meaning |
|---|---|
| `target:path:<dir>` | Audit only files under a specific directory |
| `profile:gdpr` | Run only the GDPR profile (default in v1) |
| `mode:all` / no argument | **Full GDPR audit. SOC 2 and HIPAA findings reported as `FUTURE - profile scaffolded for v1.15+`.** |

Announce: `Running compliance-audit - scope: [FULL | target: <resolved>] - profile: gdpr`.

Add caveat on first line of output: `This audit produces mechanical findings. Legal compliance attestation requires human counsel review.`

---

## Step 1 - Profile loading

Read `${CLAUDE_SKILL_DIR}/PROFILES.md`. Three profiles defined: GDPR (active), SOC 2 (future), HIPAA (future).

For v1, only GDPR checks execute. SOC 2 and HIPAA sections in the report are emitted with a single row: `Profile scaffolded for v1.15+. No checks run.` This keeps the report shape stable for future releases.

---

## Step 2 - GDPR checks (G1-G10)

The GDPR profile covers four pillars:

- **Data subject rights** (G1-G3): right to delete, right to export, right to rectification
- **Lawful basis + consent** (G4-G5): consent capture, lawful-basis declaration
- **Security measures** (G6-G8): PII identification, encryption-at-rest indicators, PII logging hygiene
- **Accountability** (G9-G10): retention policy declaration, sub-processor (DPA) transparency

Each check records findings as SEVERITY / CHECK / FILE:LINE / EVIDENCE / IMPACT / FIX.

### G1 - Right to delete (Article 17)

**Critical if no delete endpoint for user data exists; High if the endpoint exists but evidence of cascade delete is missing.**

Search `[API_ROUTES_PATH]` for routes matching:
- `DELETE /users/<id>`, `DELETE /me`, `DELETE /account`, `DELETE /profile`
- Handler method names: `delete_user`, `deleteAccount`, `destroyUser`, `anonymize_user`, `forget_user`

If no matching route found: Critical. If found but handler body does not reference associated user records (by common association keywords: `posts`, `comments`, `messages`, `orders`, `sessions`, `tokens`, plus any table from `[SCHEMA_PATH]` with a `user_id` / `userId` FK): High - the delete may leave orphan PII.

### G2 - Right to export (Article 20)

**High if no export endpoint exists.**

Search for routes matching:
- `GET /users/<id>/export`, `GET /me/export`, `GET /account/export`, `GET /data`
- Handler names: `export_user_data`, `export_data`, `download_data`, `gdpr_export`

Flag absence.

### G3 - Right to rectification (Article 16)

**Medium if no update endpoint for user profile data exists.**

Search for routes matching:
- `PATCH /users/<id>`, `PUT /users/<id>`, `PATCH /me`, `PUT /me`, `PATCH /profile`
- Handler names: `update_user`, `updateProfile`, `patch_user`

Most projects have this already via CRUD, so this is typically pass. Flag only if no user-profile-mutation route exists.

### G4 - Consent capture

**High if the application handles PII without evidence of consent flow.**

Search for consent artifacts:
- `consent`, `cookie_consent`, `gdpr_consent`, `privacy_consent` in DB schema, API routes, or frontend components
- Cookie banner files: `CookieBanner`, `cookie-consent`, `gdpr-banner`, components under `components/consent/`
- Consent ledger: a DB table or model named `consent`, `user_consents`, `consent_log`

Flag when:
- G6 detects PII fields in schema AND none of the above artifacts are present: High.
- Consent captures exist but are a single boolean flag with no granularity (one column `accepts_terms: boolean`): Medium. GDPR requires granular consent per purpose.

### G5 - Lawful basis declaration

**Medium if `[PRIVACY_DOC_PATH]` is set but the privacy policy lacks explicit lawful-basis language.**

If `[PRIVACY_DOC_PATH]` is set: grep the docs for one of `consent`, `contractual necessity`, `contract`, `legal obligation`, `legitimate interest`, `vital interest`, `public interest`, `Article 6`.

Flag if none appear: Medium.

If `[PRIVACY_DOC_PATH]` not set: skip with `N/A - no privacy doc configured`.

### G6 - PII field identification

**Medium (informational per match; total count affects severity of G4 / G7 / G8).**

Scan `[SCHEMA_PATH]` for column / field names matching the PII registry:

```
email, phone, phone_number, mobile, ssn, tax_id, fiscal_code,
passport, driver_license, id_document, birthdate, date_of_birth,
address, street, postal_code, zip, city, country,
ip_address, last_ip, user_agent,
credit_card, card_number, bank_account, iban,
gender, ethnicity, religion, health, medical_record, genetic_data,
biometric, face_id, fingerprint,
full_name, first_name, last_name, middle_name,
signature, photo, avatar
```

Also scan for column comments / descriptions containing `PII`, `personal data`, `sensitive`.

Output: list of `table.column → PII category` mappings. Count determines severity multipliers for downstream checks.

### G7 - Encryption-at-rest indicators

**High per sensitive field without encryption marker.**

For fields identified in G6 that fall under GDPR Article 9 (special categories - health, genetic, biometric, religion, ethnicity, sexual orientation): verify encryption declared:

- Column comment or description contains `encrypted`, `aes`, `pgcrypto`, `encrypted_<name>` suffix
- Application layer: `@Encrypted` decorator (TypeORM), `EncryptedString` (Prisma with extensions), `encrypted_field` (Django), field value wrapped in `pgp_sym_encrypt` in queries

Flag special-category fields without any encryption indicator: High.

For non-special PII fields: flag only if the project declares HIPAA-level posture (not in v1 scope; defer).

### G8 - PII logging hygiene

**High per match.**

Grep `[APP_SOURCE_PATH]` for logging calls that directly expand PII fields:

- `log(.*user\.(email|phone|ssn|address|birthdate))`
- `logger\.(info|debug|warn|error).*\$\{\s*user\.email\s*\}`
- `print(f?)(user\.(email|phone|ssn))` (Python)
- `console\.log\(.*user\.(email|phone|ssn)`

Also flag request-logger middleware that logs full request body without redaction hook (Morgan with default format, Winston with raw request capture).

### G9 - Retention policy declaration

**Medium if not declared.**

Search `[PRIVACY_DOC_PATH]` (or `README.md`, `CLAUDE.md`) for explicit retention language:

- `retention`, `retained for`, `deleted after`, `purge`, `archived after`
- Time window: `30 days`, `6 months`, `12 months`, `7 years`, `indefinitely` (the last is a GDPR concern)

Flag when PII is stored (G6 matches) but no retention language found anywhere searchable: Medium.

### G10 - Sub-processor (DPA) transparency

**Low (informational).**

Search for references to third-party data processors in the codebase or docs:

- `.env*` (not committed, but gitignored scaffolds): keys matching `STRIPE_*`, `SENDGRID_*`, `MAILGUN_*`, `TWILIO_*`, `SEGMENT_*`, `POSTHOG_*`, `AMPLITUDE_*`, `MIXPANEL_*`, `SENTRY_*`, `DATADOG_*`, `CLOUDFLARE_*`, `AWS_*`, `GCP_*`, `AZURE_*`, `SUPABASE_*`, `VERCEL_*`
- `package.json` / `requirements.txt`: SDK packages from the above vendors

Cross-reference with `[PRIVACY_DOC_PATH]` or `docs/sub-processors.md` if present. Flag providers in code not listed in docs: Low informational.

---

## Step 3 - Report

```
## Compliance Audit - [DATE] - [SCOPE] - profile: GDPR

> This audit produces mechanical findings. Legal compliance attestation requires human counsel review.

### Executive summary
[2-5 bullets. Critical + High findings only. Concrete facts. If nothing Critical/High: state "No critical GDPR gaps detected (mechanical scan only)".]

### GDPR readiness tier
[ONE of:]
- **Foundational** - one or more Critical findings. Core data-subject rights or consent flow missing.
- **Operational** - no Critical, but High findings present. Core flows exist but refinement needed before regulated go-live.
- **Mature** - no Critical, no High. Medium / Low findings remain. Ready for internal review.

(Tier is mechanical. A `Mature` tier does NOT constitute legal attestation.)

### GDPR pillar assessment
| Pillar | Rating | Notes |
|---|---|---|
| Data subject rights (G1-G3) | strong / adequate / weak | [delete + export + rectify] |
| Lawful basis + consent (G4-G5) | strong / adequate / weak | [consent capture + doc declaration] |
| Security measures (G6-G8) | strong / adequate / weak | [PII count + encryption + logging hygiene] |
| Accountability (G9-G10) | strong / adequate / weak | [retention + sub-processors] |
| Release readiness | ready / conditional / blocked | [blocked = any Critical] |

### Check verdicts
| # | Check | Verdict | Findings |
|---|---|---|---|
| G1 | Right to delete | OK / warn | [N] |
| G2 | Right to export | OK / warn | [present / missing] |
| G3 | Right to rectification | OK / warn | [present / missing] |
| G4 | Consent capture | OK / warn | [present / missing / granularity issue] |
| G5 | Lawful basis declaration | OK / warn / N/A | [declared / missing / no privacy doc] |
| G6 | PII field identification | informational | [N fields across M tables] |
| G7 | Encryption-at-rest | OK / warn | [N special-category fields unencrypted] |
| G8 | PII logging hygiene | OK / warn | [N logging sites] |
| G9 | Retention policy | OK / warn | [declared / missing] |
| G10 | Sub-processor transparency | OK / warn | [N providers not in docs] |

### Other profiles
| Profile | Status |
|---|---|
| SOC 2 | Scaffolded for v1.15+. No checks run. |
| HIPAA | Scaffolded for v1.15+. No checks run. |

### Prioritized findings
For each finding with severity Medium or above:
[SEVERITY] [ID] [check] - [file:line] - [evidence] - [impact] - [fix] - [effort: S / M / L]

### Quick wins
[Findings meeting: (a) Medium or High, (b) effort S, (c) single-file fix]
Format: "GDPR-[n]: [one-line description]"
If none: state explicitly.
```

---

## Step 4 - Backlog decision gate

Present Medium-or-above findings as numbered decision list (Critical → High → Medium):

```
Found N findings at Medium or above. Which to add to backlog?

[1] [CRITICAL] GDPR-? - src/routes/users.ts - no delete endpoint
[2] [HIGH]     GDPR-? - src/middleware/logger.ts:18 - email logged raw
[3] [MEDIUM]   GDPR-? - docs/privacy.md - no retention declared
...

Reply with numbers to include (e.g. "1 2 4"), "all", or "none".
```

**Wait for explicit user response before writing anything.**

Persist approved entries via the backlog write-once protocol (`.claude/rules/backlog-protocol.md`) — session scratch in an active block, direct to `docs/refactoring-backlog.md` standalone:
- Assign ID: `GDPR-[n]` (next available; when SOC 2 / HIPAA enable, they get `SOC2-[n]` / `HIPAA-[n]` prefixes)
- Add row to priority index
- Add full detail: issue, evidence, fix, effort, risk, regulatory reference (GDPR Article N)

### Severity guide

- **Critical**: no right-to-delete endpoint when PII is stored (G1)
- **High**: right-to-delete exists but cascade missing (G1); no export endpoint (G2); consent flow absent when PII handled (G4); special-category PII unencrypted (G7); PII logged raw (G8)
- **Medium**: no rectification endpoint (G3); consent exists but non-granular (G4); no lawful-basis language (G5); no retention declaration (G9)
- **Low**: sub-processor in code not listed in docs (G10); G6 informational rows

---

## Execution notes

- Do NOT modify application code, schema, or docs. Audit only.
- This skill is stack-agnostic - GDPR obligations apply to any EU-facing product regardless of backend language.
- The regulatory reference text uses GDPR article numbers where applicable (Art. 6, 9, 16, 17, 20, 28, 30). Users should consult a data protection officer or legal counsel for binding interpretation.
- This skill complements `/security-audit` (technical security controls) and `/doc-audit` (consistency of existing privacy docs). Run in Phase 5d Track B on every block that touches PII handling, user-data endpoints, or third-party SDK integration.
- After the report, ask: "Do you want me to prepare the corrections for the identified findings?" Reply with `yes` only after user sign-off.
