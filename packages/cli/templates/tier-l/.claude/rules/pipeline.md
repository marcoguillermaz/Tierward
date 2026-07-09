# Full Development Pipeline - Tier L

Use for: complex features, long-running projects, domain model changes, team of 3+.
Branch prefix `feature/` activates the full pipeline automatically.

---

## Which pipeline to use

| Work type | Branch | Pipeline |
|---|---|---|
| Bugfix / ≤3 files | `fix/description` | Tier S (Fast Lane) |
| Feature block / 1–2 weeks | `feature/block-name` | Tier M |
| Complex domain / multi-month / team | `feature/block-name` | This pipeline (Tier L) |

---

## Placeholder behavior

When a command placeholder in `CLAUDE.md` (type-check, build, test, E2E, or dev-server command) has no configured value (absent or left as a comment placeholder):
- Emit a visible step: `[SKIP] No <command-name> configured for this stack — verify manually if applicable.`
- Do NOT proceed as if the command succeeded.
- Do NOT mark the gate green.

A skip is a legitimate outcome. Silent degradation is not.

---

## Phase 0 - Session orientation

**FIRST**: check for `CONTEXT_IMPORT.md` in the project root. If it exists and contains `Status: PENDING_DISCOVERY`, run the Discovery Workflow inside that file **before any other work**. Do not proceed until discovery is marked `COMPLETE`.

**Session file - non-negotiable**: check `.claude/session/` for existing `block-*.md` files.
- If one exists: read it immediately - a previous session was interrupted. Resume from the recorded state. Do NOT create a new file. Exception: if its front matter contains `block_closed: true`, the block was closed and the file kept on purpose at the Phase 8 cleanup gate - treat it as archive, do not resume, create a new file.
- If none: create `.claude/session/block-new-session.md` starting with this machine-readable front matter (a Tierward hook reads it — keep the keys exact):

  ```
  ---
  block: new-session
  requirements_approved: false
  ---
  ```

  Below the front matter, add the current date and a placeholder skeleton, including a **Phase log** table (read by the Phase 8 metrics collect step). Rename to `block-[name].md` in Phase 1 once the block name is known.

  ```
  ## Phase log
  | phase | model | effort | elapsed | findings |
  |---|---|---|---|---|
  ```

  At each phase boundary, append one row: `model` = capability tier used (`fast`/`balanced`/`frontier`, or its provider instance), `effort` = `low`/`medium`/`high`/`xhigh`, `elapsed` = wall-clock for the phase, `findings` = count surfaced. Cost is proxied by **elapsed + model/effort**, never token counts. Keep every cell inside its vocabulary — a free-text value makes the log non-aggregable.
- The session file must exist before any other Phase 0 action runs.
- **Do not edit `requirements_approved` yourself.** The `tierward-capture-approval` hook sets it to `true` when YOU (the developer) reply at the Phase 1 STOP gate with a **bare** execution keyword — reply with just `Proceed` (or `Execute` / `Confirmed` / `Go ahead`), on its own. A keyword inside a longer sentence ("Proceed to the next file") does not arm approval — this is deliberate, so a casual imperative never authorizes a commit. The `tierward-governance-gate` hook then allows `git commit`. This is governance enforced from your approval, not Claude's self-assertion. The hook arms on the first bare keyword of the session, wherever given. Promotion is a separate signal: the bare keyword `Promote` (and only that) arms `promotion_approved`, which the gate consumes on each push to `staging`/`main` - an execution keyword never authorizes a promotion, and `Promote` never arms requirements approval.

Then:
- Read `.claude/CLAUDE.local.md` to confirm active overrides (if file exists).
- Read `MEMORY.md` (project root): Active plan section + relevant Lessons.
- If context was compressed: read `docs/implementation-checklist.md` to re-align on current state.
- Do not re-read files already in context - use the already-acquired line reference.
- **Branch check**: if on `main` or `staging`, stop. Development always starts on `feature/block-name`.

## Worktree isolation

Use git worktrees to give each feature block an isolated working tree and a dedicated Claude Code session. Branch collisions and dirty working tree conflicts go away.

**Setup** (once per functional block, before Phase 1):

```bash
git worktree add .claude/worktrees/[block-name] -b worktree-[block-name] staging
cp CLAUDE.md .claude/worktrees/[block-name]/CLAUDE.md
[ -f .claude/CLAUDE.local.md ] && cp .claude/CLAUDE.local.md .claude/worktrees/[block-name]/.claude/CLAUDE.local.md
```

Then use the `EnterWorktree` tool (Claude Code harness) or open `.claude/worktrees/[block-name]/` as a separate project in a new Claude Code session.

**Hard rules**:
- Always base the new branch on `staging`, never `main`.
- If the project uses migrations: check numbering against the main repo before writing any migration inside a worktree.
- Never merge two unreviewed worktrees to `staging` simultaneously. Serial staging only.
- Run `ExitWorktree({action: "keep"})` (or end the worktree session) **before** `git worktree remove`. Use `action: "keep"`, not `"remove"`: `ExitWorktree` only removes worktrees it created itself via `name:` — a worktree pre-created by the `git worktree add` Setup step above and entered via `path:` is never eligible for `"remove"`, so that call always fails. Filesystem removal is done by the `git worktree remove` line that follows. Removing an active worktree before exiting causes CWD loss.

Teardown is in Phase 8.

## Phase 1 - Requirements ⏸ STOP

- **Rename session file**: once the block name is known, rename `block-new-session.md` → `block-[name].md`. Skip if already named correctly (resumed session).
- Update the session file after every significant decision during requirements definition.
- Read `docs/implementation-checklist.md` to verify block dependencies.
- Read the relevant section of `docs/requirements.md`.
- Check `docs/refactoring-backlog.md` for intersecting entries.
- **Block mode selection** - auto-select based on block signals, declare the selected mode with a one-line rationale, then proceed. User can override at any point before the STOP gate.

  **Mode A - Spec-first** (auto-selected when any signal is present):
  - Tier 2 sweep is triggered (>5 files, new entity, migration, multi-role change)
  - New feature with unclear or evolving shape
  - New API endpoint, contract change, or domain model change
  - Multi-component work

  **Mode B - Scope-confirm** (auto-selected when all signals are absent):
  - Tier 1 sweep (≤5 files, single entity, no migration, no new pattern)
  - Refactor, bug fix, or isolated change with clearly bounded scope

  Declare: *"Mode A - Spec-first [or B - Scope-confirm]: [one-line rationale]. Override if needed."* Then proceed immediately to the scope sweep.

- **Scope sweep** - auto-select Tier 1 or Tier 2 based on block signals, declare it, allow user to override. Do NOT run the dependency scan until the sweep's open items are answered via the `AskUserQuestion` below (no separate keyword wait here: the Phase 1 STOP is the gate):

  **Tier 1 - Standard Sweep** (≤5 files, single entity, no migration, no new pattern):
  - **Roles & permissions**: which roles in scope? Implicit inclusions?
  - **Data**: entities read/written? Silent data loss possible?
  - **Triggers**: activating event? Secondary triggers?
  - **Error conditions**: invalid input, missing data, concurrent edits - behavior defined?
  - **UI/output states**: empty, error, loading covered? For CLI: exit codes, stderr output, no-results case.
  - **Integrations**: notifications, external systems affected?
  - **Reversibility**: irreversible operation? Rollback defined?
  - **Explicit exclusions**: what is NOT being done that a reader might assume?

  **Tier 2 - EARS Deep Sweep** (>5 files, OR new entity, OR migration, OR multi-role change, OR new integration):
  - **Triggers** `WHEN`: activating event? Secondary or implicit triggers?
  - **Conditions** `IF/THEN`: preconditions that change behavior? Edge cases, concurrent edits?
  - **States** `WHILE`: which entity states or user states affect behavior? All combinations covered?
  - **Optional / role-gated** `WHERE`: what is conditional on role, community, or config?
  - All Tier 1 dimensions (roles, data, error conditions, UI/output states, integrations, reversibility, exclusions)
  - **Pre-mortem**: if this plan fails in Phase 2 due to scope ambiguity, what caused it?

  Also declare: **does this block include critical UI flows?** (yes/no). Determines whether Phase 4 activates.
  - If **yes** and `[E2E_COMMAND]` is configured: ask the user to list numbered UAT scenarios (1–5). Claude tests exactly those - no invented scenarios.
  - If **no** or `[E2E_COMMAND]` is `# not configured`: Phase 4 is skipped. State this explicitly.

  Compose one `AskUserQuestion` with all open items. The user - not Claude - declares when scope is complete.

- **Dependency scan** (mandatory - always run `/dependency-scan`):
  Run `/dependency-scan` with the full list of affected routes/screens/commands, components/views, types/utilities, data models/DB tables in one prompt. It runs all 6 checks and returns exact file paths + line numbers. Do not run checks manually in the main session - an incomplete scan is an incomplete file list, which is a process error.
  Every file listed under "Mandatory additions" in the report must be in the file list before the STOP gate.
- **All clarification questions must use `AskUserQuestion` tool** - never inline.

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

- **Path B - Scope-confirm**: output feature summary + **complete** file list verified by dependency scan. Present for confirmation.

***** STOP — Requirements approval *****
- WHY we stopped: approving here locks the block's scope - implementation starts from this file list and spec, and your keyword arms the commit gate (`requirements_approved`).
- WHAT to do: review Path A's spec (or Path B's summary + complete file list); flag gaps now - scope changes later require re-approval.
- NEXT after action: reply with a bare execution keyword (`Execute` · `Proceed` · `Confirmed` · `Go ahead`) and the pipeline proceeds to Phase 1.5/1.6.
*****

## Phase 1.5 - Design review *(blocks touching >5 files or new patterns)*

- Present data flow, data structures, main trade-offs.
- State discarded alternatives and rationale.
- For simple blocks (≤3 files, no shared types, no migration, no new patterns): skip, stating so.
- **All clarification questions arising during design review must use the `AskUserQuestion` tool** - no inline open questions.

***** STOP — Design confirmation *****
- WHY we stopped: code written on an unconfirmed design is rework risk - this is the gate between architecture and implementation.
- WHAT to do: review the data flow, data structures, trade-offs and discarded alternatives presented above.
- NEXT after action: reply with a bare execution keyword and the pipeline proceeds to Phase 1.6 (if UI/UX impact) or the Plan lock.
*****

## Phase 1.6 - Visual & UX Design *(MANDATORY for any block with UI/UX impact)*

**Triggers**: new page route, new layout pattern, changed information architecture, complex interactive pattern.

**For visual/UI blocks:**
1. **ASCII wireframe** - full page layout with named regions, column structure, action placement, empty/loading states.
2. **Design system mapping** - map every wireframe region to the correct component and token. No region "TBD".
3. **UX rationale** - mental model used, why alternatives were discarded, key UX improvement.

**For non-visual blocks (APIs, CLIs, libraries):** replace the wireframe with the appropriate design artifact:
- API block → API contract definition (endpoints, request/response shape, error codes)
- CLI block → command structure outline (commands, flags, argument validation, output format)
- Library/module block → module API sketch (public surface, types, invariants)
- Data flow change → data flow diagram (entity states, transitions, edge cases)

***** STOP — Design artifact approval *****
- WHY we stopped: the visual/interface design (wireframe, contract, command structure, or data flow) fixes what Phase 2 will build - building on an unapproved artifact is rework risk.
- WHAT to do: review the design artifact and its UX/design rationale above; every region/endpoint/command must be mapped, none "TBD".
- NEXT after action: reply with a bare execution keyword and the pipeline proceeds to the Plan lock before Phase 2.
*****

## Plan lock + context reset *(after Phase 1/1.5 STOP gate confirmed)*

- Use `EnterPlanMode` to present the complete approved plan in locked form.
- Prompt user to enable **auto-accept edits** before proceeding.
- Call `ExitPlanMode` once confirmed.
- **Persist the approved scope**: write the confirmed file list (from the dependency scan) to the session file front matter as a `files_in_scope:` YAML list — repo-relative paths, POSIX separators, no leading `./`. The `file-list-guard` PreToolUse hook reads this to block Phase 2 edits to files outside the approved scope; until it is written the guard stays inactive (self-arming). If scope legitimately expands mid-block, add the file to `files_in_scope` before editing it. (Docs, `.claude/`, and repo-root `README`/`CHANGELOG`/`*.md` are always allowed — closure edits never need listing.)
- ***** STOP — Context reset *****
  - WHY we stopped: Phase 2 is the most expensive phase; starting it without a context reset defeats the reset's purpose. `/compact` is a CLI command only the developer can run - no agent tool performs it.
  - WHAT to do: run `/compact` now to reset the session context ("Plan locked. Run `/compact` now to reset context, then reply to continue into Phase 2.").
  - NEXT after action: reply after the compaction completes and Phase 2 implementation begins under the locked plan. Do NOT begin Phase 2 before that confirmation.
  *****

## Phase 2 - Implementation

- **First action**: update `docs/requirements.md` with the approved plan before writing code.
- Follow all coding conventions in `CLAUDE.md`.
- **After every new migration**: apply to remote DB immediately + verify + log in your project's migrations log (e.g. `docs/migrations-log.md`) if one is tracked.
- **Destructive migrations** (`DROP COLUMN`, `DROP TABLE`): write rollback SQL in a comment block at the top of the migration file before applying.
- **Security checklist** (before intermediate commit):
  - If block adds/modifies API routes: (1) auth check before any operation, (2) input validated, (3) no sensitive data in response, (4) access control not bypassed.
  - If block adds/modifies DB tables: (5) row-level access control enabled — RLS in Postgres, equivalent feature in your DB engine, or application-level guards as fallback.
  - If project is CLI: check argument sanitization, filesystem access patterns, command injection vectors.
  - If project is native mobile: check keychain usage, data-at-rest encryption, App Transport Security (ATS).
  - If none of the above apply to this block: state explicitly that no security checklist items are applicable and why.
- Run `/simplify` on changed files after writing (skip for trivial 1-file changes).
- **Bugs encountered during implementation**: if a test failure or unexpected behavior surfaces while in Phase 2, invoke `/systematic-debugging` before proposing or applying any fix.

## Phase 3 - Build + unit tests

- Run type check: `[TYPE_CHECK_COMMAND]` - must be clean.
- Run build: `[BUILD_COMMAND]` - must succeed.
- Run tests: `[TEST_COMMAND]` - all must pass.
- Output: summary line only. Do NOT paste full output - only paste error lines on failure.
- **Intermediate commit** after green.

## Phase 3b - API integration tests *(if block creates or modifies API routes)*

- Write tests covering:
  - Happy path: expected status code + key fields in response body
  - Auth: no token → 401
  - Authz: unauthorized role → 403
  - Validation: invalid payload or missing required field → 400
  - Business rules: application constraint violation → correct error code
  - DB state: after write, verify expected record with a privileged client
- [TEST_CLEANUP_PATTERN]
- Output: summary line only (`✓ N/N`).

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

## Phase 5b - Test data setup *(MANDATORY - must complete before Phase 5c)*

- Identify test account(s) from the role scope of the block.
- Set up representative test data covering all relevant states. For backend/full-stack work: insert DB records via a one-shot script (cleanup-first: delete existing test records before inserting fresh ones). For other project types: prepare fixture files, mock services, or manual inputs as appropriate. Skip explicitly if not applicable.
- Goal: the test account has realistic data for every UI state visible in Phase 5c.
- Leave test data in DB for the smoke test. Clean up after Phase 5c only if records would break other tests.

## Phase 5c - Staging deploy + smoke test

- Bring up the staging context appropriate for the project — web: dev server `[DEV_COMMAND]` and declare the endpoint; native: build and run on simulator/emulator; CLI: install the binary in a test sandbox; library: prepare a consumer test harness. Skip explicitly with a one-line statement if not applicable.

***** STOP — Promotion authorization (staging) *****
- WHY we stopped: the next command writes to the protected `staging` branch and deploys the block to the staging environment. No prior approval (Phase 1 keyword, design confirmation, plan lock, active-Phase-2 exception) covers a promotion push.
- WHAT to do: confirm you want exactly this to run: `git checkout staging && git merge [block-branch] --no-ff && git push origin staging` — where `[block-branch]` is `feature/block-name`, or `worktree-[block-name]` if this block runs in a worktree. If no staging branch or remote is configured for this project: state `[SKIP] no staging target — promotion gate not applicable`, do not invent a target, and do not mark the gate passed.
- NEXT after action: reply with the bare keyword `Promote` to authorize this ONE push; the merge+push runs, then the smoke test below.
*****

- Merge to staging: `git checkout staging && git merge [block-branch] --no-ff && git push origin staging`
- Wait for the staging context to be ready (~1–2 min if cloud deploy). Smoke test the main flow in 3–5 steps using a test account on the appropriate surface (staging URL for web, simulator session for native, terminal session for CLI, consumer test for libraries).
- For UI changes: verify in both light and dark mode.
- Output: "smoke test OK" or describe the problem and fix before proceeding.
- Fix on `feature/` branch, re-merge if issues found - re-merging repeats the Promotion authorization gate above (each authorization covers one push).

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

**Skip-confirmation - security-relevant audits (never silently skipped):** `/security-audit`, `/migration-audit`, `/skill-db`, and `/compliance-audit` gate their *skip* on human sign-off. If the `if`-condition below evaluates false for one of these four, do NOT skip autonomously - first confirm with the human via `AskUserQuestion` ("Block has no <API route / migration / schema change / PII>; skip /<audit>? [skip / run anyway]"). A wrong "doesn't apply" on a security / data / compliance audit is a real hole, so the skip requires explicit sign-off. The other Track B/C audits (`/api-design`, `/api-contract-audit`, `/dependency-audit`) and the project-structural Track skips remain autonomous **declared** skips (state `[SKIP] ...`). *(Cooperative-agent prose gate - unvalidated until real blocks exercise it, same as the metrics/file-list conventions.)*
- Run `/security-audit` if the block creates or modifies any API route. Run `/api-design` if the block adds new API routes. Both are static - run them concurrently.
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

```
## Block checklist - [Block Name]

### Build & Test
- [ ] Type check: 0 errors
- [ ] Build: success
- [ ] Unit tests: N/N passed
- [ ] API integration tests: N/N passed
- [ ] E2E tests: N/N passed (if applicable)

### Design System compliance *(if block has UI impact)*
- [ ] No hardcoded color values on interactive elements
- [ ] Empty states handled with a dedicated component, not bare text
- [ ] New async routes have loading/skeleton states
- [ ] Icon-only buttons have aria-label
- [ ] Verified in both light and dark mode

### Backend / CLI compliance *(if block has no UI impact)*
- [ ] API contract matches implementation (request/response shape, status codes, error format)
- [ ] No new secrets or credentials committed
- [ ] Auth and authorization checks present on every new route or command
- [ ] CLI commands handle invalid input and missing args explicitly (no silent no-op)

### Implemented features
- [ ] [feature 1]: [outcome]

### Manual verification
1. [step]

### Files created / modified
- path/to/file - description
```

***** STOP — Outcome sign-off *****
- WHY we stopped: your confirmation closes the build phase and authorizes the Phase 8 closure steps (backlog flush, metrics, cleanup gate, teardown, docs) - it does NOT authorize the production promotion, which has its own gate at step 10.
- WHAT to do: verify the checklist above against reality - build, tests, compliance section, implemented features, manual verification steps.
- NEXT after action: reply with a bare execution keyword and Phase 8 closure begins; nothing is declared complete and no docs are updated before that.
*****

## Phase 8 - Block closure

Only after explicit confirmation (it covers the closure steps below, never the step-10 promotion):
0. **Flush the backlog scratch** (per `.claude/rules/backlog-protocol.md`): if `.claude/session/refactoring-findings.md` exists, consolidate its entries into `docs/refactoring-backlog.md` in a **single** write - dedupe against existing entries, assign contiguous IDs per prefix. This is the block's one consolidated backlog write; the Phase 5d audits appended here instead of writing mid-block. If the scratch is absent or empty, skip. Do NOT delete the scratch here - its removal goes through the step-1 cleanup gate.
0b. **Collect phase metrics**: consolidate the session file's **Phase log** rows into `docs/metrics/phase-log.md` (create it with the same header if absent) in a single append — one block's rows per closure. Drop or fix any row whose value falls outside its column vocabulary (`model`/`effort` enums; numeric `elapsed`/`findings`) so the persistent log stays aggregable; never invent values for missing cells. Do this before deleting the session file (the Phase log lives in it). Cost is elapsed + model/effort, never tokens; keep this file as raw data — no automatic threshold-fitting. **Unvalidated:** if `docs/metrics/phase-log.md` is still empty after ~2 closed blocks, per-phase logging is not holding — simplify it rather than carry dead ceremony.
1. **Cleanup gate** (mandatory - no removal happens outside it; runs after steps 0/0b so consolidation and metrics are already banked, and BEFORE the worktree teardown in 1c):

   ***** STOP — Cleanup confirmation *****
   - WHY we stopped: files, branches and (if applicable) the worktree are about to be removed; removal is never bundled into the closure confirmation - each removal gets an explicit sign-off here, before the worktree disappears with anything still inside it.
   - WHAT to do: review the full candidate list presented via `AskUserQuestion`: `.claude/session/block-[name].md` (session file - consolidated in steps 0/0b), `.claude/session/refactoring-findings.md` (scratch, now flushed), `.claude/FIRST_SESSION.md` (one-time onboarding guide, obsolete after the first block), audit-generated screenshots/artifacts (enumerate from `git status --porcelain` untracked leftovers and known output dirs; an empty scan must be stated, not assumed), the block branch, and - if this block ran in a worktree - the worktree directory `.claude/worktrees/[block-name]` itself. Also confirm serial staging is clear: no other developer active in a sibling worktree. The spec archive move (step 5) is a move, not a removal - it is not part of this gate.
   - NEXT after action: only the approved items are deleted, the worktree teardown in 1c runs, then closure continues with step 2. If the session file is kept: set `block_closed: true` in its front matter so the next session does not resume it as interrupted.
   *****

1c. **Worktree teardown** *(only if this block ran in a worktree — skip otherwise; runs only on cleanup-gate approval)*:
    - Run `ExitWorktree({action: "keep"})` first (never `"remove"` — the tool only removes worktrees it created via `name:`, not ones entered via `path:`; `"remove"` always fails here). Or close the worktree session.
    - `git worktree remove .claude/worktrees/[block-name]`
    - `git branch -d worktree-[block-name]`

2. Update `docs/implementation-checklist.md`: mark ✅, add Log row.
3. Update `CLAUDE.md` only if block introduces non-obvious patterns, changes access control rules, or adds a new convention.
4. Update `docs/requirements.md` if spec changed during implementation.
5. If Mode A was used: move `docs/specs/[block-name].md` → `docs/specs/archive/[block-name].md` and mark as `Status: IMPLEMENTED`.
5. Write ADR in `docs/adr/` if an architectural decision was made.
6. **Lessons capture**: review corrections received during this block. Add any non-obvious pattern rule to `tasks/lessons.md` (rule + why it exists). Do not wait for the next block.
7. Update `MEMORY.md` (project root) only if new lessons emerged not already documented.
7. **Canonical doc updates** (conditional - only update docs that exist in the project):
   - If `docs/sitemap.md` exists and the block added/removed routes: update it now.
   - If `docs/db-map.md` exists and the block changed the schema: update it now.
   - If `docs/contracts/` exists and the block modified a domain entity: update the relevant contract.
   - If test counts changed in this block (integration, unit, E2E): update every place the totals appear - README shields.io badges, inline counts in README Testing section, and CLAUDE.md mentions. Stale counts signal an unmaintained project.
8. **Commit sequence** - up to 3 commits, never mixed:
   - **Commit 1** (already done in Phase 3): source files only.
   - **Commit 2 - docs**: `docs/` changes + `README.md` if updated - separate commit.
   - **Commit 3 - context** (only if updated): `CLAUDE.md` and/or `MEMORY.md` - never mixed with code or docs.
   - Closure commits land on the block branch (return to it after Phase 5c if needed). Getting them onto `staging` goes through the same Promotion authorization gate as any other push - never push them directly.
9. **PR review** (recommended): once the PR is open and CI is green, run `/pr-review <PR_NUMBER>` for an autonomous local code review. The review is posted as a PR comment for audit trail and surfaces a merge decision (`integrate` / `fix branch` / `proceed`). Use `--deep` for changes touching auth, money paths, or migrations.

   **Merge barrier (auto-mode-safe):** step 10 runs on `/pr-review`'s *returned* verdict, never on its *launch*. If you gate the merge on the review, promote only after `/pr-review` has returned an explicit `integrate` / `proceed` (or a human decision on `fix branch`). A null / empty / errored / crashed return is **not** a clean verdict — a review that did not complete counts as *not reviewed*: do not promote, re-run or review manually. The launch acknowledgment is not the verdict. And a clean verdict satisfies this barrier only - it is machine output, never promotion authorization: the step-10 gate below still requires the developer's own keyword, given after the gate is displayed.
10. Promote to production - behind its own gate:

    ***** STOP — Promotion authorization (production) *****
    - WHY we stopped: the next command writes to the protected `main` branch and ships the block to production. No prior approval (Phase 6 sign-off, closure confirmation, or a `/pr-review` verdict) covers this push.
    - WHAT to do: confirm you want exactly this to run: `git checkout main && git merge staging --no-ff && git push origin main`.
    - NEXT after action: reply with the bare keyword `Promote` to authorize this ONE push; the merge+push runs, then Phase 8.5 context review closes the session.
    *****

    `git checkout main && git merge staging --no-ff && git push origin main`

## Phase 8.5 - Context review + compact

**C1–C3** (grep-only - delegate to `/context-review`):
Run `/context-review`. It runs C1 (credential patterns), C2 (unresolved placeholders), C3 (field name staleness) in a single call and returns pass/fail per check with matched lines. Apply any fix in the main session before proceeding.

**C4–C12** (judgment-required - run in main session):
Execute checks C4 through C12 from `.claude/rules/context-review.md` in order.
Apply any fix before moving to the next check.
**Phase complete only when all 12 checks pass** - not when the review "seems thorough".

**Mandatory closing message** (before `/compact`):

```
**Block complete ✅ - [Block name]**
- Implemented: [one-line summary]
- Tests: type check ✅ · build ✅ · unit N/N ✅ [+ API ✅ · E2E ✅ if applicable]
- Next: [next block name] OR "No next block defined"
```

This message is non-negotiable - never skip it, even for small blocks.

Then the developer may run `/compact` to free the session context — optional, nothing downstream depends on it, and `/compact` is a CLI command only the user can run (no agent tool performs it).

---

## Cross-cutting rules

- **Never commit to `main` or `staging` directly.** The only sanctioned writes to these branches are this pipeline's merge-promotions (Phase 5c, Phase 8 step 10), each behind its own Promotion authorization gate.
- **Promotion is never automatic**: any `git push` to `origin staging` or `origin main`, from any phase and for any reason (first merge, re-merge after a failed smoke test, closure docs, anything else), requires its own Promotion authorization gate answered with the bare keyword `Promote`. No prior approval - plan confirmation, the active-Phase-2 exception, Phase 6 sign-off, block-closure confirmation, or a `/pr-review` verdict - covers a promotion.
- **Worktree isolation (hard rule)**: use a worktree for every functional block. Never merge two unreviewed worktrees to `staging` simultaneously. Serial staging only.
- **STOP gates are hard stops** - not suggestions. Never proceed to the next phase without explicit confirmation. Every STOP states why it stopped, what to do, and the next step after action.
- **Execution keywords**: `Execute` · `Proceed` · `Confirmed` · `Go ahead` - the only phrases that authorize autonomous action after a STOP gate. `Promote` is separate: it authorizes exactly one promotion push and nothing else; conversely no execution keyword authorizes a promotion.
- **Exception - active Phase 2**: once a plan is confirmed and an execution keyword was given, proceed autonomously through implementation without re-confirming each file edit. The confirmation covers the approved plan, not each step.
- **Green before commit**: type check + tests must pass before every commit.
- **Conventional commits**: `feat(scope):`, `fix(scope):`, `docs:`, `chore:` - imperative, under 72 chars.
- **No unrequested changes**: implement only what was approved in Phase 1.
- **Dependency scan is mandatory**: always run `/dependency-scan` in Phase 1. Never produce a file list without first running the full scan. An incomplete scan is a process error.
- **Context hygiene**: if you notice the context window approaching ~50% during Phase 2, ask the user to run `/compact [keep: current implementation state and open TODOs]` before continuing (`/compact` is a CLI command only the user can run — no agent tool performs it). After they confirm the compaction, re-read `.claude/CLAUDE.local.md` to restore active overrides.
- **Secret hygiene**: never commit `.env*` files, tokens, or credentials.
- **Immediate migration**: every migration file must be applied to the remote DB immediately after writing.
- **Read-only ops are always free**: `Read`, `Grep`, `Glob`, `git status/log/diff` may run without prior confirmation.

---

## Pipeline for Structural Requirements Changes

Activate when stakeholders change functional scope on already-implemented blocks.

**Phase R1 - Requirements update**
- Compare the change with the relevant section of `docs/requirements.md`.
- Propose updated text section by section.
- ***** STOP — Requirements-change approval *****
  - WHY we stopped: this rewrites the project's requirements baseline - an unapproved section silently changes what every downstream block builds against.
  - WHAT to do: review each proposed section; approve or amend them one by one.
  - NEXT after action: approved sections are written to `docs/requirements.md`, then Phase R2 impact analysis runs.
  *****

**Phase R2 - Impact analysis**
- Identify all already-implemented blocks impacted by the change.
- For each block: list affected files, logic to update, tests to revise.
- Check `docs/refactoring-backlog.md`: can existing entries be deprecated or updated in light of the change?
- Output: impact matrix (block → file → change type) + refactoring-backlog delta.

**Phase R3 - Intervention plan**
- Update `docs/implementation-checklist.md` with the new plan.
- Update `docs/refactoring-backlog.md` (deprecate obsolete entries, add emerging issues).
- ***** STOP — Intervention-plan approval *****
  - WHY we stopped: the plan spans already-implemented blocks - executing it unapproved would rework shipped code on inferred scope.
  - WHAT to do: review the full intervention plan (impact matrix, checklist updates, backlog delta).
  - NEXT after action: reply with a bare execution keyword and Phase R4 executes block by block through the standard pipeline (Phases 0–8.5). No code is touched before that.
  *****

**Phase R4 - Execution**
- Read `docs/implementation-checklist.md` - the approved plan per block is defined and ready.
- Proceed block by block following the standard pipeline (Phases 0–8.5).
