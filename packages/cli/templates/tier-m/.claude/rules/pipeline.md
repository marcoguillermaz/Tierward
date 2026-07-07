# Standard Development Pipeline - Tier M

Use for: single feature blocks with moderate blast radius - 1–2 collaborators, no complex domain model changes, impact contained to the current feature area.
Branch prefix `feature/` activates this pipeline automatically.

---

## Which pipeline to use

| Work type | Branch | Pipeline |
|---|---|---|
| Low blast radius, single dev, reversible in minutes | `fix/description` | Fast Lane (Tier S) |
| Single feature, moderate impact, 1–2 collaborators | `feature/block-name` | This pipeline |
| High blast radius, team, complex domain, shared systems | - | Tier L (full pipeline) |

---

## Placeholder behavior

When a command placeholder in `CLAUDE.md` (type-check, build, test, E2E, or dev-server command) has no configured value (absent or left as a comment placeholder):
- Emit a visible step: `[SKIP] No <command-name> configured for this stack — verify manually if applicable.`
- Do NOT proceed as if the command succeeded.
- Do NOT mark the gate green.

A skip is a legitimate outcome. Silent degradation is not.

---

## Phase 0 - Session orientation

- **FIRST**: check for `CONTEXT_IMPORT.md` in the project root. If it exists and contains `Status: PENDING_DISCOVERY`, run the Discovery Workflow inside that file **before any other work**. Do not proceed to Phase 1 until discovery is marked `COMPLETE`.
- **Session file - non-negotiable**: check `.claude/session/` for existing `block-*.md` files.
  - If one exists: read it immediately - a previous session was interrupted. Resume from the recorded state. Do NOT create a new file.
  - If none exists: create `.claude/session/block-new-session.md` starting with this machine-readable front matter (a Tierward hook reads it — keep the keys exact):

    ```
    ---
    block: new-session
    requirements_approved: false
    ---
    ```

    Below the front matter, add the current date and a placeholder skeleton. Rename to `block-[name].md` in Phase 1 once the block name is known.
  - The session file must exist before any other Phase 0 action runs.
  - **Do not edit `requirements_approved` yourself.** The `tierward-capture-approval` hook sets it to `true` when YOU (the developer) reply at the Phase 1 STOP gate with a **bare** execution keyword — reply with just `Proceed` (or `Execute` / `Confirmed` / `Go ahead`), on its own. A keyword inside a longer sentence ("Proceed to the next file") does not arm approval — this is deliberate, so a casual imperative never authorizes a commit. The `tierward-governance-gate` hook then allows `git commit`. This is governance enforced from your approval, not Claude's self-assertion.
- Read `.claude/CLAUDE.local.md` to confirm active overrides (if file exists).
- Read `MEMORY.md` (project root): Active plan + relevant Lessons.
- If context was compressed: read `docs/implementation-checklist.md` to re-align on current state.
- **Branch check**: if on `main` or `staging`, stop. Create `feature/block-name` first.

## Phase 1 - Requirements ⏸ STOP

- **Rename session file**: once the block name is determined, rename `block-new-session.md` → `block-[name].md`. Skip if already named correctly (resumed session).
- Update the session file after every significant decision during requirements definition.
- Read `docs/implementation-checklist.md` to verify block dependencies.
- Read the relevant section of `docs/requirements.md`.
- Check `docs/refactoring-backlog.md` for intersecting entries.

- **Block mode selection** - auto-select based on block signals, declare the selected mode with a one-line rationale, then proceed. User can override at any point before the STOP gate.

  **Mode A - Spec-first** (auto-selected when any signal is present):
  - Tier 2 sweep is triggered (>5 files, new entity, migration, multi-role change)
  - New feature with unclear or evolving shape
  - New API endpoint or contract change
  - Multi-component work

  **Mode B - Scope-confirm** (auto-selected when all signals are absent):
  - Tier 1 sweep (≤5 files, single entity, no migration, no new pattern)
  - Refactor, bug fix, or isolated change with clearly bounded scope

  Declare: *"Mode A - Spec-first [or B - Scope-confirm]: [one-line rationale]. Override if needed."* Then proceed immediately to the scope sweep.

- **Scope sweep** - select Tier 1 or Tier 2 based on block signals, declare it, allow the user to override:

  **Tier 1 - Standard Sweep** (≤5 files, single entity, no migration, no new pattern):
  - **Roles & permissions**: which roles are in scope? Any implicit inclusion?
  - **Data**: entities read/written? Silent data loss possible?
  - **Triggers**: what user action activates this? Secondary triggers?
  - **Error conditions**: invalid input, missing data, concurrent edits - behavior defined?
  - **UI/output states**: empty, error, loading covered? For CLI: exit codes, stderr output, no-results case.
  - **Integrations**: emails, notifications, external systems affected?
  - **Reversibility**: any irreversible operation? Rollback defined?
  - **Explicit exclusions**: what is NOT being done that a reader might assume is included?

  **Tier 2 - Deep Sweep** (>5 files, OR new entity, OR migration, OR multi-role change):
  - All Tier 1 dimensions, plus:
  - **States** `WHILE`: which entity states or user states affect behavior?
  - **Conditions** `IF/THEN`: preconditions that change behavior? Edge cases?
  - **Optional / role-gated** `WHERE`: what is conditional on role or config?
  - **Pre-mortem**: if this plan fails in implementation due to scope ambiguity, what caused it?

  Also declare: **does this block include critical UI flows?** (yes/no). Determines whether Phase 4 activates.
  - If **yes** and `[E2E_COMMAND]` is configured: ask the user to list numbered UAT scenarios (1–5). Claude tests exactly those - no invented scenarios.
  - If **no** or `[E2E_COMMAND]` is `# not configured`: Phase 4 is skipped. State this explicitly.

  Compose one `AskUserQuestion` with all open items from the sweep. Do NOT proceed to the dependency scan until an execution keyword is received.

- **Dependency scan** (mandatory - always run `/dependency-scan`):
  Run `/dependency-scan` with the full list of affected routes/screens/commands, components/views, types/utilities, and data models/DB tables. Every file listed under "Mandatory additions" must be in the file list before the STOP gate.

- **Path A - Spec-first**: generate `docs/specs/[block-name].md` using this structure:

  ```markdown
  # Spec - [block-name]
  **Date**: [date]  **Sweep**: [Tier 1 / Tier 2]  **Mode**: Spec-first

  ## Goal
  [One sentence: what changes for the user when this block ships.]

  ## Acceptance Criteria
  - WHEN [trigger], the system MUST [outcome] [measurable constraint]
  - WHEN [trigger], the system MUST [outcome]
  - IF [precondition], THEN [behavior]
  (3–5 criteria. EARS format: WHEN/IF/WHILE + MUST/SHALL.)

  ## Scope
  **In scope** (confirmed by dependency scan): [file or component list]
  **Out of scope** (explicit): [what is NOT being done]

  ## Definition of Done
  - [ ] All acceptance criteria verified manually
  - [ ] Tests cover the criteria above
  - [ ] Phase 6 checklist signed off
  ```

  Present the spec. Do not proceed to Phase 2 until the spec is explicitly approved.

- **Path B - Scope-confirm**: output feature summary + complete file list verified by dependency scan. Present for confirmation.

***** STOP - Path A: spec review. Path B: requirements summary. Wait for explicit confirmation before Phase 2. *****

## Phase 1.5 - Design review *(blocks touching >5 files or new patterns)*

- Present data flow, data structures, main trade-offs.
- State discarded alternatives and rationale.
- Skip for simple blocks (≤3 files, no shared types, no migration, no new patterns).
- **All clarification questions arising during design review must use the `AskUserQuestion` tool** - no inline open questions.

***** STOP - wait for design confirmation before writing code. *****

## Phase 2 - Implementation

- Update `docs/requirements.md` with the approved plan before writing any code.
- Follow all coding conventions in `CLAUDE.md`.
- **After every new migration**: apply to remote DB immediately + verify + log in your project's migrations log (e.g. `docs/migrations-log.md`) if one is tracked.
- **Security checklist** (before intermediate commit):
  - If block adds/modifies API routes: (1) auth check before any operation, (2) input validated, (3) no sensitive data exposed in response, (4) access control not bypassed.
  - If block adds/modifies DB tables: (5) row-level access control enabled — RLS in Postgres, equivalent feature in your DB engine, or application-level guards as fallback.
  - If project is CLI: check argument sanitization, filesystem access patterns, command injection vectors.
  - If project is native mobile: check keychain usage, data-at-rest encryption, App Transport Security (ATS).
  - If none of the above apply to this block: state explicitly that no security checklist items are applicable and why.
- Run `/simplify` on changed files after writing (skip for trivial 1-file changes).
- **Bugs encountered during implementation**: if a test failure or unexpected behavior surfaces while in Phase 2, invoke `/systematic-debugging` before proposing or applying any fix.

## Phase 3 - Build + tests

- Run type check: `[TYPE_CHECK_COMMAND]` - must be clean.
- Run build: `[BUILD_COMMAND]` - must succeed.
- Run tests: `[TEST_COMMAND]` - all must pass.
- Output: summary line only (e.g. `✓ 42/42`). Do NOT paste full output.
- **Intermediate commit** after green: `git add … && git commit -m "feat(scope): description"`

## Phase 3b - API integration tests *(if block creates or modifies API routes)*

- Write core tests covering:
  - Happy path: expected status code + key fields in response body
  - Auth: no token → 401
  - Authz: unauthorized role → 403
  - Validation: invalid payload or missing required field → 400
  - Business rules: application constraint violation → correct error code
  - DB state: after write, verify expected record with a privileged client
- [TEST_CLEANUP_PATTERN]
- Run `[TEST_COMMAND] [API_TESTS_PATH]` - all green before proceeding.

## Phase 4 - UAT / E2E tests *(conditional - read before skipping)*

**This phase activates only when both conditions hold**:
1. `[E2E_COMMAND]` is set in CLAUDE.md Key Commands (not `# not configured`)
2. At the Phase 1 scope gate, the user confirmed critical UI flows and defined the UAT scenarios

If either condition is false: **skip this phase and state so explicitly** - do not proceed silently.

- Implement exactly the numbered UAT scenarios defined by the user at the Phase 1 scope gate. Do not add, remove, or reinterpret scenarios.
- Use stable, non-visual selectors appropriate for the target platform — `data-*` attributes for web, accessibility identifiers for native mobile (iOS/Android), element IDs or automation IDs for desktop. Never use CSS color classes or positional selectors.
- Each scenario becomes one test: scenario title as test name, steps as the test body.
- Run: `[E2E_COMMAND]`
- Output: summary line only (`✓ N/N`). On failure: list the failing scenario by name.

## Phase 5b - Test data setup *(before smoke test)*

- Identify the test account(s) from the role scope of the block.
- Set up representative test data covering all relevant states. Form depends on project type — DB records for backend/full-stack work, fixture files for libraries, mock services for distributed apps, manual inputs for CLI. Skip explicitly if not applicable.
- Goal: the test account has realistic data for every UI state that must be visible during smoke.

## Phase 5c - Staging deploy + smoke test

- Bring up the staging context appropriate for the project — web: dev server `[DEV_COMMAND]` and declare the endpoint; native: build and run on simulator/emulator; CLI: install the binary in a test sandbox; library: prepare a consumer test harness. Skip explicitly with a one-line statement if not applicable.
- Merge to staging: `git checkout staging && git merge feature/block-name --no-ff && git push origin staging`
- Wait for the staging context to be ready, then verify the main flow in 3–5 steps using a test account on the appropriate surface (staging URL for web, simulator session for native, terminal session for CLI, consumer test for libraries).
- For blocks with UI changes: verify in both light and dark mode.
- Output: "smoke test OK" or describe the problem and fix before proceeding.
- Fix issues on `feature/` branch, re-merge if needed.

## Phase 5d - Block-scoped quality audit *(blocks with UI or API changes)*

**Track A - UI audit** *(if block adds/modifies UI routes or components AND the project is a web or native UI application)*

If the project is CLI-only, backend-only, or native-standalone without a UI layer: state `[SKIP] Track A — not a web or native UI project` and move to Track B.

- Run `/ui-audit` scoped to the block's new/modified routes only (token compliance, component adoption, empty states).
- Run `/accessibility-audit` scoped to the block's new/modified routes (WCAG 2.2, contrast, static a11y patterns).
- Run `/visual-audit` scoped to the block's new/modified pages (typography, spacing, hierarchy, colour, density, dark-mode, micro-polish).
- Run `/ux-audit` scoped to the block's user flows (task completion, feedback clarity, cognitive load).
- Run `/responsive-audit` only if the block modifies routes used by non-admin roles.
- **Execution order**: `/ui-audit` is static - launch it concurrently with the first browser-based skill. Then: `/accessibility-audit` → `/visual-audit` → `/ux-audit` → `/responsive-audit` sequentially (they share the browser session).

**Track B - API/DB + compliance audit** *(if the project has a backend component AND the block creates/modifies API routes, applies migrations, or handles PII - static analysis, no dev server needed; on CLI-only or native-standalone projects without a backend, skip Track B and state explicitly)*
- Run `/security-audit` if the block creates or modifies any API route.
- Run `/api-design` if the block adds new API routes. Both are static - run them concurrently.
- Run `/api-contract-audit` if the block modifies OpenAPI spec or API routes - checks contract drift, breaking changes, Richardson Maturity.
- Run `/migration-audit` if the block applies migrations - static analysis of migration files.
- Run `/skill-db` if the block changes the schema or adds new tables - live verification of schema state, access control policies, and query patterns.
- Run `/compliance-audit` if the block touches PII fields, user-data endpoints, consent flow, or third-party SDK integration - GDPR profile (v1.14); SOC 2 / HIPAA scaffolded for v1.15+.

**Track C - Test + doc + infra audit** *(runs for every block after Phase 3 is green - static analysis, no dev server needed)*
- Run `/test-audit` - static analysis of coverage (auto-detects lcov / Istanbul / Cobertura / go / tarpaulin / xcresult), pyramid shape (unit/integration/e2e ratio), anti-patterns (`.only` leaks, skipped tests, empty bodies, no-assertion tests, hardcoded sleeps).
- Run `/doc-audit` - static doc-drift check (relative-link resolution, code-block syntax, Tierward placeholder residuals, slash-command name match, skill-count consistency, ADR freshness). Stack-aware for Next.js / Django / Swift.
- Run `/infra-audit` - static infra-security check across GitHub Actions, Dockerfile, Kubernetes manifests, Terraform, GitLab CI. Each layer runs only if its markers are detected. Stack-agnostic.
- Run `/dependency-audit` if the block touches `package.json`, `pyproject.toml`, `Package.swift`, `Cargo.toml`, `go.mod`, or any other dependency manifest - tier classification (A/B/C), changelog summary for Tier B/C, codebase impact grep, runtime LTS status. Audit-only in v1.
- Output: one-paragraph summary per skill. Critical findings (`.only` committed, 0% coverage on a file changed in this block, Tierward placeholder in README, pwn-request in workflow, secret logging in CI, privileged K8s container, IAM wildcard action, hardcoded secret in Terraform) block Phase 6.

**Severity handling - all tracks**:
- **Critical**: fix before Phase 6. Do not proceed with open Critical issues.
- **Major**: flag in Phase 6 checklist with planned resolution sprint.
- **Minor**: persist per the **backlog write-once protocol** (`.claude/rules/backlog-protocol.md`) - inside this block, each audit appends its approved Minor findings to the session scratch `.claude/session/refactoring-findings.md`; the shared `docs/refactoring-backlog.md` gets a single consolidated write at Phase 8 closure. Assign ID prefix (`PERF-`, `API-`, `DB-`, `MIG-`, `SEC-`, `A11Y-`, `DEV-`, `UX-`, `TEST-`).
- Output per skill: one-paragraph summary only.

## Phase 6 - Outcome checklist ⏸ STOP

Present this checklist with actual results:

```
## Block checklist - [Block Name]

### Build & Test
- [ ] Type check: 0 errors
- [ ] Build: success
- [ ] Tests: N/N passed
- [ ] API tests: N/N passed (if Phase 3b executed)

### Implemented features
- [ ] [feature 1]: [outcome]

### Manual verification steps
1. [step]

### Files created / modified
- path/to/file - description
```

***** STOP - do not declare complete, do not update docs, until explicit confirmation. *****

## Phase 8 - Block closure

Only after explicit confirmation:
0. **Flush the backlog scratch** (per `.claude/rules/backlog-protocol.md`): if `.claude/session/refactoring-findings.md` exists, consolidate its entries into `docs/refactoring-backlog.md` in a **single** write - dedupe against existing entries, assign contiguous IDs per prefix - then delete the scratch. This is the block's one consolidated backlog write; the Phase 5d audits appended here instead of writing mid-block. If the scratch is absent or empty, skip. Do this before deleting the session file (the scratch lives under `.claude/session/`).
1. **Delete session file**: remove `.claude/session/block-[name].md`.
   - Proceed only if the user's confirmation unambiguously closes the block.
   - If the confirmation is ambiguous (partial approval, open questions): ask explicitly before deleting.
   - Never delete the session file speculatively.
1b. **Delete first-session guide** (if it exists): remove `.claude/FIRST_SESSION.md`. This file is a one-time onboarding guide - it is no longer needed after the first block completes.
2. Update `docs/implementation-checklist.md`: mark ✅, add Log row.
3. Update `CLAUDE.md` only if block introduces non-obvious patterns or changes conventions.
4. Update `docs/requirements.md` if spec changed during implementation.
5. If Mode A was used: move `docs/specs/[block-name].md` → `docs/specs/archive/[block-name].md` and mark as `Status: IMPLEMENTED`.
6. **Lessons capture**: review corrections received during this block. Add any non-obvious pattern rule to `tasks/lessons.md` (rule + why it exists). Do not wait for the next block.
7. Update `MEMORY.md` (project root) only if new lessons emerged not already documented.
7. **Canonical doc updates** (conditional - only update docs that exist in the project):
   - If `docs/sitemap.md` exists and the block added/removed routes: update it now.
   - If `docs/db-map.md` exists and the block changed the schema: update it now.
   - If `docs/prd/prd.md` exists: update it to reflect this block's outcomes.
   - If test counts changed in this block (integration, unit, E2E): update every place the totals appear - README shields.io badges, inline counts in README Testing section, and CLAUDE.md mentions. Stale counts signal an unmaintained project.
8. **Commit sequence**:
   - **Commit 1** (already done in Phase 3): source files only.
   - **Commit 2 - docs**: `docs/` changes + `README.md` if updated.
   - **Commit 3 - context** (only if updated): `CLAUDE.md` and/or `MEMORY.md` - never mixed with code or docs.
9. **PR review** (recommended): once the PR is open and CI is green, run `/pr-review <PR_NUMBER>` for an autonomous local code review. The review is posted as a PR comment for audit trail and surfaces a merge decision (`integrate` / `fix branch` / `proceed`). Use `--deep` for changes touching auth, money paths, or migrations.
10. Promote to production: `git checkout main && git merge staging --no-ff && git push origin main`

## Phase 8.5 - Context review + compact

**C1–C3** (grep-only - run in main session):
Execute checks C1 through C3 from `.claude/rules/context-review.md` using Grep/Glob tools. These are mechanical pattern matches - no judgment needed. Apply any fix before proceeding to C4.

**C4–C12** (judgment-required - run in main session):
Execute checks C4 through C12 from `.claude/rules/context-review.md` in order.
Apply any fix before moving to the next check.
**Complete only when all checks pass.**

**Mandatory closing message** (before `/compact`):

```
**Block complete ✅ - [Block name]**
- Implemented: [one-line summary]
- Tests: type check ✅ · build ✅ · tests N/N ✅ [+ any other phases]
- Next: [next block name] OR "No next block defined"
```

This message is **non-negotiable** - never skip it, even if the block was small or the session is long.

Then the developer may run `/compact` to free the session context — optional, nothing downstream depends on it, and `/compact` is a CLI command only the user can run (no agent tool performs it).

---

## Cross-cutting rules

- **Never commit to `main` or `staging` directly.**
- **STOP gates are hard stops** - not suggestions. Never proceed to the next phase without explicit confirmation.
- **Execution keywords**: `Execute` · `Proceed` · `Confirmed` · `Go ahead` - these are the only phrases that authorize autonomous action after a STOP gate.
- **Exception - active Phase 2**: once a plan is confirmed and an execution keyword was given, proceed autonomously through implementation without re-confirming each file edit. The confirmation covers the approved plan, not each step.
- **Green before commit**: type check + tests must pass before every commit.
- **Conventional commits**: `feat(scope):`, `fix(scope):`, `docs:`, `chore:` - imperative, under 72 chars.
- **No unrequested changes**: implement only what was approved in Phase 1.
- **Dependency scan is mandatory**: always run `/dependency-scan` in Phase 1. Never produce a file list without first running the full scan.
- **Context hygiene**: if you notice the context window approaching ~50% during Phase 2, ask the user to run `/compact [keep: current implementation state and open TODOs]` before continuing (`/compact` is a CLI command only the user can run — no agent tool performs it).
- **Secret hygiene**: never commit `.env*` files, tokens, or credentials.
- **Read-only ops are always free**: `Read`, `Grep`, `Glob`, `git status/log/diff` may run without prior confirmation - no STOP gate needed for these.
