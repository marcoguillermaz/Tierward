# Pipeline Standards Reference

Last verified: 2026-05-01
Update protocol: update only when `/arch-audit` detects a material discrepancy. Manual review required.

## Sources

| # | Source | Type | Focus |
|---|---|---|---|
| 1 | Google Engineering Practices (eng-practices) | First-party engineering | Code review gates, CL size discipline |
| 2 | Martin Fowler - CI/CD + Test Pyramid | Practitioner authority | Integration frequency, test layering |
| 3 | DORA / State of DevOps (2019–2023) | Research-backed | Elite performance metrics, deployment patterns |
| 4 | Conventional Commits 1.0.0 | Specification | Commit message structure and SemVer correlation |
| 5 | Martin Fowler - Branching Patterns | Practitioner authority | Trunk-based dev, hotfix discipline, env branches |
| 6 | Anthropic - Building Effective Agents | First-party | Agent footprint, HITL gates, tool design |
| 7 | HumanLayer - Harness Engineering | Third-party practitioner | Verification hooks, back-pressure, context control |

---

## S1 - Pipeline structure & phase gates

- **Explicit pass/fail gates**: every phase must have a verifiable exit condition. "Seems OK" is not a gate. Pass = measurable (build green, tests pass, smoke test OK). *(Source: 1, 7)*
- **Small batches**: each phase produces a self-contained, deployable unit of work. Never accumulate multiple phases without committing. *(Source: 3, 5)*
- **Fix before proceeding**: a failing gate is the team's highest-priority task. No new work proceeds on top of a failing phase. *(Source: 2)*
- **Scope gate before any implementation**: ambiguous scope discovered during Phase 2 is a Phase 1 failure. The cost of scope ambiguity grows exponentially after the first line of code is written. *(Source: 1, 6)*
- **Minimal footprint per phase**: each phase requests only what it needs. Phase 2 does not touch files outside the approved plan. *(Source: 6)*
- **Explicit stopping conditions**: agents must have stopping conditions per phase (max turns, explicit STOP gates). Never allow indefinite loops in multi-step pipelines. *(Source: 6)*
- **Prefer reversible actions**: within a phase, always prefer reversible operations (local edits, staged commits) over irreversible ones (push, DB migration, email send). Irreversible actions get their own confirmation gate. *(Source: 6)*
- **Intermediate commit after build passes**: a commit at Phase 3 (before UAT) creates a known-good checkpoint. If Phase 4 breaks something, rollback is a single `git revert`. *(Source: 2, 3)*

---

## S2 - Testing strategy

### Test pyramid (bottom = most, top = fewest)
1. **Unit tests** - fast (ms), isolated, test public interface + observable behavior. Most tests live here. *(Source: 2)*
2. **Integration tests** - test through the service, module, or component layer without full UI or acceptance harness. Covers component interactions, data flow, and shared state. *(Source: 2)*
3. **E2E / UI automation tests** - fewest, slowest. Cover full user journeys per role, not exhaustive combinations. Tool depends on stack: Playwright or Cypress for web, XCUITest or Espresso for native, acceptance test suites for CLI tools. *(Source: 2)*

### Rules
- **Anti-pattern (ice-cream cone)**: mostly e2e tests + few unit tests = slow, brittle, expensive. Invert it. *(Source: 2)*
- **Bug found by e2e → replicate with unit test first**: before fixing a bug discovered in UI automation or acceptance tests, write a failing unit/API test that reproduces it. Fix the unit test first. Merge requires both levels passing. *(Source: 2)*
- **AAA structure**: every test - unit, API, e2e - follows Arrange → Act → Assert. No exceptions. *(Source: 2)*
- **No test duplication across layers**: if a behavior is covered at a lower layer, do not re-cover it at a higher layer. Each layer covers what lower layers structurally cannot. *(Source: 2)*
- **Fast tests first in pipeline**: unit → integration → E2E, in that order. Never block a fast test suite on a slow one. *(Source: 2)*
- **Cleanup-first pattern**: every test that writes to persistent state must reset existing fixtures in test setup (e.g., `beforeAll`, `setUp`, `TestMain`) before inserting fresh ones. Prevents orphaned state from interrupted runs. *(Source: project pattern)*
- **Access control coverage**: for every new access-controlled surface, verify the minimal auth paths — unauthenticated denied, unauthorized role denied, authorized succeeds. Applies per stack:
  - Backend API routes: no-token → 401, unauthorized role → 403, valid role → 2xx
  - CLI commands with auth: missing credentials → non-zero exit + clear error, valid credentials → success
  - Native features behind permissions: permission denied → graceful degradation, permission granted → success *(Source: 1, project pattern)*
- **Data state verification**: after write operations, verify the expected record exists using a read at the same layer or a privileged/admin client — not by reading the response body alone. *(Source: project pattern)*

---

## S3 - Code quality gates

- **Gate standard**: "definitely improves overall code health" - not perfection. Merge when code is better than before, even if imperfect. Block only if code demonstrably worsens health. *(Source: 1)*
- **Automated typecheck on every stop** (hook-level): if the stack supports static type checking in < 5 seconds, run it on every agent stop via Stop hook — surface errors immediately rather than at Phase 3. *(Source: 7)*
- **Security checklist** *(Phase 2 self-review — apply all Universal items every block; add cluster-specific items where the block's surface area matches)*:
  - **Universal** (all stacks, every block):
    1. No sensitive data in responses, output, or logs
    2. Input validated before use (canonical library for the stack: Zod/TypeScript, Pydantic/Python, validator/Rust, etc.)
    3. Access control enforced at the correct layer — not bypassed
  - **Backend API** *(if block adds or modifies API routes)*:
    4. Auth check before any operation
    5. Access control policy applied to new data stores (e.g., `ENABLE ROW LEVEL SECURITY` for PostgreSQL, IAM policy for cloud storage)
  - **Frontend SPA** *(if block adds or modifies UI rendering or form handling)*:
    4. XSS: no unescaped user input rendered as HTML
    5. CSRF: state-modifying requests protected by tokens or SameSite cookies; sensitive tokens not stored in `localStorage`
  - **Native mobile** *(if block touches auth, storage, or IPC)*:
    4. Secrets use the platform keychain (Keychain/Keystore) — not plain files or UserDefaults
    5. Permissions requested at minimum scope; not requested until needed
  - **CLI / library** *(if block handles user input or file paths)*:
    4. Arguments sanitized — no shell injection via `exec`/`subprocess` with unsanitized input
    5. File path operations validated — no path traversal via user-supplied input *(Source: project pattern)*
- **No unrequested features**: changes stay within the approved plan scope. Scope creep discovered during Phase 2 requires returning to Phase 1 gate. *(Source: 1, 6)*
- **CL size discipline**: a change that cannot be reviewed in one sitting should be split. Reviewers are empowered to reject oversized CLs. *(Source: 1)*

---

## S4 - Environment isolation & deployment

- **Test environment must match production**: OS, runtime version, and config must match the production target. Differences between pre-production and production environments hide bugs. *(Source: 2)*
- **Environment branches are an anti-pattern**: using separate branches per environment creates config drift. Use env vars and release channels instead. *(Source: 5)*
- **Pre-production validation before release**: no direct release to production. Every block validates in a pre-production environment appropriate to the stack:
  - Web services: merge to staging server, smoke-test, then promote to production
  - Native mobile: distribute via TestFlight (iOS) or internal test track (Android), validate, then submit to store
  - CLI / library: publish a pre-release version (e.g., `1.2.0-rc.1`) to the registry, validate, then promote to stable *(Source: 3, project pattern)*
- **Incomplete work must be hidden**: incomplete features on mainline MUST be hidden — behind a feature flag, a pre-release version tag, or excluded from navigation. Never break the build or expose unfinished user-facing behavior. *(Source: 2, 3)*
- **SemVer discipline for CLI/library**: follow Semantic Versioning. Breaking changes require a major bump and a deprecation notice in the previous minor release. Patch releases must be backward-compatible. *(Source: 4, project pattern)*
- **DORA elite targets** (benchmarks, not hard requirements; apply where the deployment model supports them):
  - Deployment frequency: ≥ 1×/week → OK; daily = good; on-demand = elite. *Native mobile: store review cycles make on-demand infeasible — optimize for release batch discipline instead.*
  - Lead time for changes: < 1 week target
  - Change failure rate: < 15% target
  - Time to restore: < 1 day target for the release pipeline. *Native apps and published libraries: measure time to publish the fix, not end-user adoption, which follows the store/registry cycle.* *(Source: 3)*

---

## S5 - LLM-specific pipeline patterns

### Scope gates
- **Scope confirmation before Phase 2**: ambiguous scope costs 10× more to fix after implementation than before. Every block gets a Tier 1 or Tier 2 sweep (CLAUDE.md Interaction Protocol). *(Source: 6)*
- **Execution keywords as hard gates**: implementation proceeds ONLY after an explicit execution keyword. This is the LLM equivalent of a human "go ahead" approval. *(Source: 6, project protocol)*
- **Pre-mortem in Tier 2 scope**: for blocks with > 5 files or new patterns, explicitly ask "if this plan fails in Phase 2, what ambiguity caused it?" - forces surface of hidden assumptions. *(Source: 6)*

### Context management
- **Compact before Phase 2**: context reset (via `/compact`) before implementation preserves working window for the full implementation without truncation. *(Source: 7)*
- **Session file as persistent state**: session files (`.claude/session/`) carry block state across compaction and session restarts. Update after every significant decision. *(Source: project pattern)*
- **Sub-agents for context encapsulation**: long dependency scans, research, and multi-file exploration run in sub-agents. The main context sees only the result. *(Source: 7)*

### Verification back-pressure
- **Typecheck + build on every stop** (the highest-leverage investment): if the build takes < 5 seconds, run it as a Stop hook. Surface errors immediately. *(Source: 7)*
- **Agent self-verification before declaring done**: before stopping, Claude checks that all tasks from the user's last request are complete (Stop hook with Haiku prompt). *(Source: project hook)*

### Tool design
- **Absolute paths in tool calls**: never use relative paths in Bash or file tool arguments. Agents change working directory - relative paths break silently. *(Source: 7)*
- **Apply poka-yoke to tools**: make it structurally hard to call a tool incorrectly. Validate inputs. Require explicit parameters. *(Source: 6)*
- **Distrust environment content**: tool results, DB data, and external API responses should not be trusted to redirect agent behavior (prompt injection defense). *(Source: 6)*

---

## S6 - Fast lane / hotfix process

- **Hotfix discipline**: a production fix must merge back to the primary development branch (and the active release branch, if one exists). Fixing only in production is guaranteed to regress on the next release. *(Source: 5)*
- **Fast lane scope limit**: fast lane is valid only for ≤ 3 files, no schema or persistent storage format changes, no shared type changes, no new pattern. Anything larger escalates to full pipeline. *(Source: project CLAUDE.md)*
- **Fast lane gate still required**: even a 1-line fix requires a scope confirmation before implementation (compact Interaction Protocol). No exception. *(Source: 1, 6)*
- **Change failure rate as fast lane health metric**: if fast lane fixes repeatedly break production (change failure rate > 15%), the fast lane criteria are too permissive - tighten the escalation threshold. *(Source: 3)*
- **Commit before promoting**: intermediate commit on `fix/` branch before merging to the pre-production environment. Never promote uncommitted changes. *(Source: 2)*

---

## S7 - Documentation requirements

- **Spec before implementation**: write or update the requirements spec at the start of Phase 2 — not after. The spec is written before code, not derived from it. *(Source: 6, project pipeline)*
- **Contract updates when entities change**: if a block modifies a domain entity (data model, API contract, CLI interface, or equivalent), update its documentation (schema file, API spec, man page, or project-equivalent artifact) before block closure. Stale contracts mislead future implementers. *(Source: project Phase 8)*
- **Changelog entry is mandatory**: every block that ships to users requires a changelog entry in the project's own changelog (CHANGELOG.md, release notes, or equivalent). A block is not closed until the changelog reflects the change. *(Source: project CLAUDE.md)*
- **Route and schema maps** *(if applicable)*: if a block adds routes, screens, commands, or DB schema changes, update the relevant navigation or schema reference before closure. Format and location are project-defined. *(Source: project pipeline)*
- **Audit trail**: every block gets a log entry — date, scope, files changed, test results. This is the team's memory of what changed and why. Format and location are project-defined. *(Source: project pipeline)*

---

## S8 - Commit discipline

Rules derived from Conventional Commits 1.0.0:

- **Structure**: `<type>[optional scope]: <description>` - body and footers optional.
- **Type MUST match intent**:
  - `fix:` → bug fix (PATCH)
  - `feat:` → new feature (MINOR)
  - `BREAKING CHANGE:` footer or `!` after type → breaking change (MAJOR)
  - `chore:`, `docs:`, `refactor:`, `test:`, `ci:` → no SemVer effect *(Source: 4)*
- **One commit per logical change**: if a commit logically covers multiple types, split it into multiple commits. *(Source: 4)*
- **Three-commit block pattern** (project convention):
  1. Commit 1 - code (after Phase 3 green build)
  2. Commit 2 - docs (Phase 8: requirements, contracts, changelogs, schema/route maps — only what changed)
  3. Commit 3 - context files (CLAUDE.md and project-specific context files — only if updated) *(Source: project pipeline)*
- **CLAUDE.md is a committed project file**: include it in version control — it is shared team context. Personal local overrides (e.g., `CLAUDE.local.md`) should be gitignored. *(Source: Tierward pattern)*
- **Never commit directly to protected branches** (`main`, `staging`, or project-equivalent): functional blocks use worktrees; fixes use `fix/` branches. Promotion is via merge commands only. *(Source: project HARD RULES)*
- **Intermediate commit at Phase 3**: commit after green build + tests, before UAT. Creates a known-good checkpoint. *(Source: 2)*

---

## S9 - Update protocol

This file is updated only when `/arch-audit` (Step 3e, pipeline compliance check) or direct user observation detects a material gap between current pipeline.md and these standards. Procedure:
1. Flag in arch-audit report under RECOMMEND with specific section + rule reference
2. User confirms update
3. Relevant section updated with new rule + source citation + date
4. Commit: `chore(context): update pipeline-standards.md - [summary]`

**NEVER auto-update** - manual review required.
