# Contributing to claude-dev-kit

Thanks for considering a contribution. claude-dev-kit (CDK) is a scaffold for legible, reviewable AI-assisted development on top of Claude Code. Its core differentiation is mechanical enforcement: a Stop hook that blocks task completion until tests pass, and audit skills that run static checks rather than judgment-heavy probes. Every contribution should preserve that principle. When in doubt, prefer a check that grep can execute over one that needs an LLM to reason about.

This guide covers what you need to ship a PR: local setup, the conventions we follow, how PRs are reviewed, and what we expect from skill authors. Read the section that matches your contribution and skim the rest. The "For maintainers" section at the end is for repo administrators handling release cycles.

---

## 1. Ways to contribute

- **Bug reports** — open an issue using the Bug Report template. Include the command you ran, expected vs actual behavior, Node version, OS.
- **Feature requests** — open an issue using the Feature Request template. Explain the use case, not just the feature.
- **Skill requests** — request a new audit skill via the Skill Request template. Describe the gap in mechanical coverage that today's portfolio leaves open.
- **New skills** — see Section 6 (Adding a new skill) and the [Custom Skills Guide](docs/custom-skills.md).
- **Pull requests** — fixes to the CLI, scaffold templates, audit skills, tests, or documentation.

---

## 2. Development setup

**Requirements**: Node.js >= 22, Git, a working `gh` CLI if you plan to open a PR from the terminal.

```bash
git clone https://github.com/marcoguillermaz/claude-dev-kit.git
cd claude-dev-kit
cd packages/cli && npm install
```

**Run the CLI locally**:

```bash
node packages/cli/src/index.js --help
node packages/cli/src/index.js init
node packages/cli/src/index.js doctor
node packages/cli/src/index.js add skill arch-audit
node packages/cli/src/index.js add rule security --stack swift
node packages/cli/src/index.js new skill
```

**Run the test suites**:

```bash
node packages/cli/test/integration/run.js     # 1129 integration checks
node --test packages/cli/test/unit/*.test.js  # 373 unit tests
```

Both must pass before you submit a PR. Add `--verbose` to the integration runner to see per-assertion output when debugging.

**Lint and format**:

```bash
npm run --prefix packages/cli lint            # eslint src/ test/
npm run --prefix packages/cli format:check    # prettier --check
npm run --prefix packages/cli format          # prettier --write (apply)
```

CI runs prettier --check on every PR. A failure here blocks merge — apply `format` locally before staging.

---

## 3. Project structure

```
claude-dev-kit/
├── CHANGELOG.md, README.md, CONTRIBUTING.md, SECURITY.md
├── docs/
│   ├── operational-guide.md         # Audience: teams adopting CDK (full reference)
│   ├── custom-skills.md             # Audience: skill authors (frontmatter + body schema)
│   ├── product-brief.md             # Strategic positioning
│   ├── workspace-quality-rubric.md  # 8-dimension scoring
│   └── reviews/                     # gitignored, internal review snapshots
├── packages/cli/
│   ├── package.json                 # Version + npm metadata
│   ├── src/
│   │   ├── index.js                 # CLI entry (commander)
│   │   ├── commands/                # init, doctor, upgrade, add, new
│   │   ├── scaffold/
│   │   │   ├── index.js             # interpolate() + tier copy + pruning
│   │   │   └── skill-registry.js    # Single source of truth for skill applicability
│   │   ├── generators/              # claude-md.js, readme.js, context-import.js
│   │   └── utils/
│   │       ├── constants.js         # SKILL_MD_MAX_LINES, AUDIT_MODELS
│   │       ├── detect-stack.js      # Async stack detection
│   │       ├── doctor-cross-file.js # Sync helpers for cross-file doctor checks
│   │       ├── skill-frontmatter.js # YAML frontmatter parser (regex-based)
│   │       └── stack-commands.js    # Default commands per stack
│   ├── templates/
│   │   ├── tier-0/                  # Discovery: 3 files only
│   │   ├── tier-s/                  # Fast Lane: 4-step pipeline
│   │   ├── tier-m/                  # Standard: 8 phases, 2 STOP gates
│   │   ├── tier-l/                  # Full: 14 phases, 4 STOP gates
│   │   └── common/                  # Shared rules, ADR templates, FIRST_SESSION
│   └── test/
│       ├── unit/                    # node:test unit tests
│       ├── integration/run.js       # Full scaffold + assertion suite
│       └── integration/fixtures/    # Wizard answer JSON files for --answers
└── scripts/                         # Local-only utilities (gitignored where applicable)
```

The `templates/tier-{s,m,l}/.claude/skills/<skill-name>/` directories hold the audit skill bodies. Tier M and Tier L copies are byte-identical for every skill in the registry — see Section 5 for the rationale.

---

## 4. Design principles

These principles drive review decisions. Internalize them before writing code or skill bodies.

**Mechanical over judgment-heavy.** Every audit skill should resolve via grep, file parsing, or filesystem reads. Patterns like "the code looks idiomatic" or "this seems compliant" produce inconsistent findings and erode trust. If a check can't be expressed as a regex, set-diff, or structured-data parse, defer it.

**Stack-aware depth, not stack lock-in.** The 11 supported stacks (Node-TS, Node-JS, Python, Go, Swift, Kotlin, Rust, .NET, Ruby, Java, generic) get tailored treatment via `skill-registry.js` flags and the `interpolate()` substitution in `scaffold/index.js`. Templates themselves contain no framework-specific assumptions — adaptation lives at the boundary.

**Agnostic-only patterns in templates.** Scaffolded `SKILL.md` files contain zero pre-filled API examples, zero project-specific artifacts, zero references to staff-manager (the original incubator project). A template that ships with a hardcoded Express route is broken.

**Byte-identical Tier M and Tier L by default.** When a skill applies to both M and L, the two copies must be byte-identical. Use `cp` after writing the M version. If a skill genuinely needs different framing for L (rare), explain why in the PR description.

**Body length budget**: 500 lines per `SKILL.md` body (frontmatter excluded). Doctor enforces this as `skill-md-size-budget` (warn). Integration test enforces it as a hard fail (CDK-internal). When you approach the limit, extract content into a sibling file (`PATTERNS.md`, `REPORT.md`, `PROFILES.md`, `advanced-checks.md`) — progressive disclosure per Anthropic spec.

**Spec-compliant frontmatter.** `allowed-tools` must be space-separated (`Read Glob Grep Bash`), not comma-separated. The doctor check `skill-allowed-tools-syntax` warns on commas; integration tests fail on them.

---

## 5. Process governance

These conventions are mandatory for every PR. We follow them ourselves on every release; we expect contributors to follow them too.

**R1 — Every commit goes through `/commit`.** The CDK repo uses the `/commit` skill (defined in `.claude/skills/commit/SKILL.md`) to enforce Conventional Commits 1.0.0 with a fixed scope taxonomy: `cli`, `scaffold`, `wizard`, `templates`, `drift-tracker`, `arch-audit`, `docs`, `deps`, `release`, `ci`, `context`, `scripts`. No `git commit -m "..."` directly. If a pre-commit hook fails, fix the underlying issue and re-invoke `/commit` — never `--amend`, never `--no-verify`.

**R2 — Humanize prose for user-facing GitHub content.** Run the `/humanize` skill on README updates, CHANGELOG release-note paragraphs (the human prose, not the bullet list), CONTRIBUTING / SECURITY changes, GitHub Release descriptions, and PR bodies. The skill removes AI tells (mechanical scaffolding, hedging, em-dash overuse, "In conclusion" closers) without inventing facts. Domain hints: `announcement` for marketing copy, `generico` for technical sections.

**Atomic commits per skill.** When a PR ships multiple skills (e.g. v1.14.0's three-skill bundle), each skill gets its own `feat(scaffold)` commit that is independently green: skill template files + registry entry + cheatsheet row + pipeline.md invocation + the `skill-registry.test.js` length assertion bump for that skill. The integration test scenarios go in a separate `test(cli)` commit. The version bump + CHANGELOG + README + operational-guide go in a final `chore(release)` commit.

**Prettier before staging.** `npx prettier --write packages/cli/src/ packages/cli/test/` before `git add` on any `.js` file. CI lint includes `prettier --check`; a missed format pass blocks merge.

**Mid-feature budget checkpoints.** When writing a `SKILL.md` body, run `wc -l` after roughly half the steps. If the body is trending over 400 lines with material left to write, extract stack-specific or layer-specific content into a sibling file before the budget runs out.

**R3 — Documentation update is mandatory for any user-facing change.** A user-facing change is anything that adds, removes, or alters a CLI command, scaffolded file, skill, doctor check, MCP tool, schema, or public API surface. The PR cannot land until the relevant docs are touched: `README.md` where the surface is described (opening tagline, "What it does", Architecture, CLI Commands, dedicated section), `docs/operational-guide.md` for the operational subsection, and `CHANGELOG.md` with an entry under `[Unreleased]` or the release block. The `.github/PULL_REQUEST_TEMPLATE.md` checklist enforces this at PR-open time. Buried documentation is treated as a credibility regression — the smoke-test review on v1.16.0 caught exactly this drift, where a headline feature was technically present but invisible from the README.

---

## 6. Adding a new skill

This walkthrough takes you from "I have a skill idea" to "PR ready for review". Follow the order — every step has dependencies on the previous one.

### Step 1: registry entry

Add an entry to `packages/cli/src/scaffold/skill-registry.js`:

```js
{ name: 'my-skill', minTier: 'm', requires: { hasApi: true }, cheatsheet: true },
```

Fields:
- `name`: directory name. Must match the SKILL.md parent folder.
- `minTier`: lowest tier that includes the skill (`'s'`, `'m'`, or `'l'`).
- `requires`: feature flags that must NOT be `false` for the skill to install. Empty object = always installed.
- `excludeNative` (optional): set `true` if the skill should be removed for native stacks (Swift, Kotlin, Rust, .NET, Java) regardless of flags.
- `cheatsheet`: whether the skill appears in `cheatsheet.md`.

Update `packages/cli/test/unit/skill-registry.test.js`: bump `assert.equal(SKILL_REGISTRY.length, N)` by one.

### Step 2: SKILL.md frontmatter and body

Create `packages/cli/templates/tier-m/.claude/skills/my-skill/SKILL.md`:

```yaml
---
name: my-skill
description: One-paragraph summary that describes the audit surface and lists key checks. Used by Claude Code as activation context.
user-invocable: true
model: sonnet
context: fork
argument-hint: [target:path:<dir>|target:file:<glob>|mode:all]
allowed-tools: Read Glob Grep Bash
---
```

Body structure (pattern from `test-audit`, `migration-audit`, `doc-audit`):

1. **Scope for v1** — what's in scope, what's deferred (with placeholder ID for tracking)
2. **Configuration** — `[PLACEHOLDER]` values the user fills in on first run
3. **Step 0** — argument parsing (target / mode tokens)
4. **Step 1..N** — per-check static analysis with severity guide
5. **Step N+1** — Report template
6. **Step N+2** — Backlog decision gate (numbered list, wait for user reply, then write to `docs/refactoring-backlog.md`)
7. **Execution notes** — read-only/write boundary, complementarity with other skills
8. **Stack adaptation** (if applicable) — describes what the sibling `PATTERNS.md` contains

Body limit: 500 lines (excluding frontmatter). Run `wc -l` while drafting.

### Step 3: sibling files (when needed)

- **`PATTERNS.md`** — stack-specific or layer-specific grep patterns. Used when the skill spans multiple stacks (e.g. `test-audit`, `doc-audit`, `infra-audit`).
- **`REPORT.md`** — externalized report template when the inline template would push the body over budget.
- **`PROFILES.md`** — regulatory profiles or check sets that may activate / deactivate (e.g. `compliance-audit`).
- **`advanced-checks.md`** — extracted check sections used to keep the body under budget (e.g. `arch-audit`).

Sibling files have no frontmatter — they're plain Markdown read by the skill body via `${CLAUDE_SKILL_DIR}/<file>`.

### Step 4: copy to tier-l

```bash
cp -r packages/cli/templates/tier-m/.claude/skills/my-skill \
      packages/cli/templates/tier-l/.claude/skills/
diff -q packages/cli/templates/tier-m/.claude/skills/my-skill \
        packages/cli/templates/tier-l/.claude/skills/my-skill
```

The diff must be empty.

### Step 5: cheatsheet row

Add a row to both `packages/cli/templates/tier-m/.claude/cheatsheet.md` and `tier-l/.claude/cheatsheet.md`:

```
| `/my-skill` | One-line description of what the skill checks | When to run |
```

### Step 6: pipeline.md invocation

Edit `packages/cli/templates/tier-m/.claude/rules/pipeline.md` and `tier-l/.claude/rules/pipeline.md`. Add the skill to the appropriate Phase 5d Track:

- **Track A** — UI audits (`ui-audit`, `accessibility-audit`, `visual-audit`, `ux-audit`, `responsive-audit`)
- **Track B** — API/DB + compliance (`security-audit`, `api-design`, `api-contract-audit`, `migration-audit`, `skill-db`, `compliance-audit`)
- **Track C** — Test + doc + infra (`test-audit`, `doc-audit`, `infra-audit`)

Append a bullet describing when the skill runs and what triggers Phase 6 blocking. If the new skill changes Track headers, update integration test regexes that match those headers. If the skill runs outside Phase 5d (e.g. Phase 1 dependency scan, Phase 8.5 context review), edit the relevant phase section instead.

### Step 7: integration scenario

Add `scenarioMySkillPresent()` to `packages/cli/test/integration/run.js`. Use the shared `assertSkillPresent()` helper:

```js
async function scenarioMySkillPresent() {
  section('my-skill skill presence + tier pruning');

  for (const tier of ['s', 'm', 'l']) {
    const config = { ...BASE, tier, isDiscovery: false };
    const dir = await scaffold(`my-skill-tier-${tier}`, tier, config);
    const skillDir = path.join(dir, '.claude/skills/my-skill');
    const shouldExist = tier === 'm' || tier === 'l';

    if (shouldExist) {
      await assertSkillPresent(dir, tier, 'my-skill', { siblings: ['PATTERNS.md'] });
    } else {
      if (!fs.existsSync(skillDir)) {
        pass(`Tier ${tier}: my-skill pruned (not on tier S)`);
      } else {
        fail(`Tier ${tier}: my-skill present but should be pruned`);
      }
    }
  }
}
```

Register the scenario in `main()` after the other `scenarioXxxPresent` calls. Add flag-pruning verification if the registry entry uses `requires`.

### Step 8: backlog ID prefix

Pick a short uppercase prefix for findings that the skill produces. Existing prefixes: `PERF-`, `API-`, `DB-`, `MIG-`, `SEC-`, `A11Y-`, `DEV-`, `UX-`, `TEST-`, `DOC-`, `INFRA-`, `GDPR-`. Document the prefix in the skill's "Backlog decision gate" section and in the operational guide.

### Step 9: documentation

- **README.md** — bump skill count (`X audit skills`), add a row to the skills table, update Testing section badge if integration count changed.
- **docs/operational-guide.md** — add a row to the skill availability table, add a full skill detail section (`#### /my-skill`) after the most-related existing skill.
- **CHANGELOG.md** — entry under `[Unreleased]` describing what the skill audits, severity calibration, and stack coverage.
- **Active Skills row** is added automatically by `injectActiveSkills()` based on the registry entry — no manual edit needed.

---

## 7. Testing strategy

CDK ships two test layers:

**Unit tests** (`packages/cli/test/unit/*.test.js`) cover pure functions: `skill-registry`, `doctor-cross-file`, `skill-frontmatter`, individual scaffold helpers. Use `node:test`. Run via `npm run --prefix packages/cli test:unit`. Total: 373 tests across 61 suites.

**Integration tests** (`packages/cli/test/integration/run.js`) scaffold full projects to a tmp directory and assert on file structure, content, and CLI behavior. Uses a custom `pass()` / `fail()` reporter (no test framework). Total: 1129 checks across ~118 scenarios. Run via `npm test --prefix packages/cli`.

**Fixtures** for full CLI execution via `--answers` live in `packages/cli/test/integration/fixtures/`. Each fixture is a JSON file matching the wizard prompt schema. Used by `scenarioWizardCoverage`.

**Output directory** for integration scaffolds is `packages/cli/test/integration/output/` — gitignored. Cleared at the start of every run.

When you add a scenario, follow the existing pattern: section header, scaffold a tmp project, assert on its content, increment `passed` / `failed` counters via `pass()` / `fail()`. Don't introduce a test framework — the existing reporter is intentionally tiny and self-contained.

---

## 8. How PRs are reviewed

We aim for short turnaround. To make that possible, the criteria below are explicit.

### Must-have (auto-block merge)

- Both test suites green (integration + unit) — CI enforces.
- `npm run lint` clean — CI enforces.
- `prettier --check` clean — CI enforces.
- Atomic commits: one `feat(scaffold)` per skill, one `test(cli)` for scenarios, one `chore(release)` for version + docs. Bisect must produce a green tree at every commit.
- Each `feat(scaffold)` commit independently bumps `skill-registry.test.js` `length` assertion — never bundled in the test commit.
- `SKILL.md` body ≤ 500 lines (frontmatter excluded). Verified by integration `scenarioSkillMdSpecCompliance`.
- `allowed-tools` space-separated (no commas). Verified by the same scenario.
- Tier M and Tier L copies byte-identical (verify with `diff -q`).

### Nice-to-have (review feedback, not block)

- PR body humanized via `/humanize announcement`. We'll ask for it on user-facing prose if missing.
- Sibling `PATTERNS.md` for stack-specific or layer-specific content rather than inline.
- New skill ran through `/skill-review` before submission (Tier M lite mode is sufficient).
- Backlog prefix documented in the skill's gate section AND in operational-guide.md.
- Mid-feature `wc -l` checkpoint visible in commit history if the body grew close to 500.

### Auto-reject (unless rationale strong)

- Mocked tests in places where integration tests should hit real scaffolding.
- Monolithic commits ("add 3 skills" in one feat).
- Judgment-heavy patterns ("if the code looks compliant", "based on best practices") in audit skill bodies.
- Fabricated facts in CHANGELOG (counts that don't match `npm test`, dates in the future, references to gitignored files).
- Direct `git commit -m "..."` without `/commit` skill (R1 violation).
- Missing humanization on user-facing prose (R2 violation) when the change is a release note.
- Skill that re-implements a check already covered by an existing skill.

We respond to all PRs within a few working days. Drive-by typo fixes get fast-merged when the change is unambiguous.

---

## 9. Reporting bugs and feature requests

**Bug Report** template fields:
- Command you ran (`npx mg-claude-dev-kit init`, `doctor`, etc.)
- Expected vs actual behavior
- Node.js version (`node --version`)
- OS and shell

**Feature Request** template asks for use case before feature description. We weigh feature requests against the active roadmap (see [GitHub Milestones](https://github.com/marcoguillermaz/claude-dev-kit/milestones) and the `roadmap-status.md` rolled into each release). Skill requests via the Skill Request template are evaluated against the existing portfolio — if the request overlaps with an existing skill, we'll suggest extending the existing one rather than creating a new one.

For security-relevant issues, use the SECURITY.md disclosure path, not a public GitHub issue.

---

## 10. Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be kind to people, harsh on bad code. Disagreements about technical direction are welcome and expected — disagreements about basic respect are not.

---

## 11. For maintainers

This section is for repo administrators handling release cycles. Contributors don't need to read it — the workflow ends at "PR merged".

### Release process

1. **Verify CI green on `main`** after the PR merge: `gh pr checks <merged-pr-number>` should show all green and the PR linked to a single squash commit on `main`.
2. **Sync local main**: `git checkout main && git pull origin main`.
3. **Create the tag**: `git tag -a v<MAJOR>.<MINOR>.<PATCH> -m "v<MAJOR>.<MINOR>.<PATCH> - <one-line summary>"`. Push with `git push origin v<MAJOR>.<MINOR>.<PATCH>`.
4. **Run `/humanize`** on the GitHub Release notes draft (domain `announcement`).
5. **Create the GitHub Release**: `.claude/scripts/gh-release.sh v<MAJOR>.<MINOR>.<PATCH> "Release title" humanized-notes.md`. The script pins `GH_TOKEN` to `marcoguillermaz` on its own; no manual account switch needed. Output is the release URL.
6. **Comment on the closed issue** with a humanized closing note pointing to the Release URL.
7. **Update `roadmap-status.md`** locally: roadmap row → Done with the merge date and PR number. The file is gitignored under `.claude/initiatives/` — local source of truth.
8. **Sync the GitHub Project**: `gh project item-edit --project-id <project-id> --id <item-id> --field-id <Status-field-id> --single-select-option-id <Done-option-id>`. The current project IDs live in `.claude/initiatives/roadmap-status.md` (gitignored).

### npm publish (when applicable)

For changes that affect `packages/cli/src/` or `packages/cli/templates/`, npm publish is needed. Docs-only releases (CONTRIBUTING / README refreshes) typically don't require a version bump or npm publish — see `git log --oneline` for prior docs-only patterns (PRs #88, #110).

When publishing:

```bash
cd packages/cli
npm version <patch|minor|major> --no-git-tag-version  # if version not already bumped in the chore(release) commit
npm publish
```

### Auth scoping protocol

The `gh` CLI account `marcoguillermaz-spec` is read-only on this repo (no `workflow` scope). Release creation requires `marcoguillermaz`. `.claude/scripts/gh-release.sh` pins `GH_TOKEN=$(gh auth token --user marcoguillermaz)` as its first action: the correct token is injected regardless of which account is currently active. Do not call `gh auth switch` before running the script; it is not needed for release operations.

### Branch protection

`main` is protected. No direct pushes. Even maintainers go through PRs. Force pushes to `main` are forbidden; if a release tag needs correction, delete and recreate.

### Pre-release verification

For minor or major releases, run a manual smoke test before publishing:
1. Scaffold a tmp project at the target tier with realistic feature flags.
2. Run `doctor --report` and confirm all checks pass or skip cleanly.
3. Invoke a representative subset of skills inside Claude Code on the scaffolded project.

Patch releases (docs-only or single-skill fixes) skip this step — CI coverage is sufficient.

---

Thanks for reading this far. If a section is unclear, open an issue with the `documentation` label. That feedback is what helps us sharpen this guide for the next contributor.
