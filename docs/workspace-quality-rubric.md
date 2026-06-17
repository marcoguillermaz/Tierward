# Workspace Quality Rubric v1.0

A reusable rubric for evaluating the quality of any AI-assisted development workspace - the set of files that give an AI coding assistant (Claude Code, Cursor, Copilot, etc.) the context it needs to work effectively on a project.

## How to use this rubric

**Scope**: evaluate the workspace configuration files (CLAUDE.md, rules, skills, settings, pipeline definitions, context files). Not the application code itself.

**Scale**: each dimension is scored 0-3.

| Score | Meaning |
|-------|---------|
| 0 | Absent or unusable - the dimension is not addressed |
| 1 | Partial - some coverage but with significant gaps or generic content |
| 2 | Adequate - functional, project-specific, minor gaps |
| 3 | Excellent - specific, verified, no wasted tokens, actively maintained |

**Weights**: not all dimensions matter equally.

| Dimension | Weight | Rationale |
|-----------|--------|-----------|
| D1 Project Identity | 1x | Foundational but easy to achieve |
| D2 Tech Grounding | 1x | Correct commands = minimum viable workspace |
| D3 Workflow Clarity | 1.5x | Process definition is the core governance value |
| D4 Rules Effectiveness | 1x | Rule quality drives behavior quality |
| D5 Skills Completeness | 1x | Stack-dependent, not always applicable |
| D6 Context Economy | 1.5x | Context budget is the #1 constraint (Anthropic docs) |
| D7 Safety Guards | 2x | Mistakes here cause irreversible damage |
| D8 Cross-file Coherence | 1x | Structural integrity of the workspace |

**Total score**: sum of (dimension score x weight) / (3 x sum of weights) x 100 = percentage.

With these weights: max raw = 3 x (1+1+1.5+1+1+1.5+2+1) = 3 x 10 = 30. Score = (raw / 30) x 100.

**Tool ceiling note**: score 3 on D4, D5, D6, and D7 requires Claude Code-specific features (skills/, hooks, path-scoped rules). Workspaces using other tools (Cursor, Copilot, Windsurf) have an effective ceiling of 2 on these dimensions. Maximum achievable score for non-Claude-Code workspaces is ~77%.

**Gap attribution**: for each gap found, mark whether it is:
- **Tool-side** (T) - the scaffolding tool produced incorrect or generic output
- **User-side** (U) - the user has not completed required customization (e.g., placeholders unfilled)
- **Design-side** (D) - the workspace design is missing a capability

---

## D1 - Project Identity

**Weight**: 1x

**What it measures**: can the AI assistant answer "what is this project, what does it do, who is it for" without asking the user?

### Criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| 1.1 | Project purpose stated in 1-2 sentences | Read CLAUDE.md opening section. Is there a concrete description or a placeholder? |
| 1.2 | Target user or audience identified | Stated explicitly or inferable from context |
| 1.3 | Project scope boundaries clear | The AI can determine what is in-scope vs out-of-scope for this project |
| 1.4 | Domain terminology defined (if applicable) | Non-obvious terms explained, or pointer to glossary |

### Scoring

| Score | Definition | Example |
|-------|------------|---------|
| 0 | No project description, or only the project name | `# my-app` with no further context |
| 1 | Generic description that could apply to many projects | "A web application built with modern technologies" |
| 2 | Specific description with purpose, audience, and key domain concepts | "Invoice management SaaS for freelancers. Core entities: invoice, client, payment. Multi-currency support via Stripe." |
| 3 | Score 2 + scope boundaries + non-obvious domain rules stated | Score 2 plus "Out of scope: tax calculation (handled by external service). Key constraint: invoices are immutable after send." |

### Red flags
- Placeholder text still present (`[PROJECT_NAME]`, `[describe your project]`)
- Description copied from package.json or README without adaptation
- No mention of what the project actually does (only tech stack listed)

---

## D2 - Tech Grounding

**Weight**: 1x

**What it measures**: are the technology stack, build commands, and development workflow correctly specified for the actual project?

### Criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| 2.1 | Tech stack listed with specific technologies (not just categories) | "Next.js 14 + TypeScript" not "frontend framework" |
| 2.2 | Key commands are runnable | Execute install, dev, build, test commands - do they work? |
| 2.3 | Stack-specific conventions stated | Naming conventions, file structure patterns, framework idioms relevant to this stack |
| 2.4 | Dependencies and tools mentioned match what is actually installed | package.json / Podfile / Cargo.toml matches CLAUDE.md claims |

### Scoring

| Score | Definition | Example |
|-------|------------|---------|
| 0 | No tech stack information, or commands are placeholders | `[INSTALL_COMMAND]` still present |
| 1 | Tech stack listed but commands are wrong, generic, or incomplete | Lists "React" but test command runs `npm test` when project uses `vitest` |
| 2 | Tech stack correct, commands work, basic conventions stated | Stack, commands, and "use functional components, prefer server components" all accurate |
| 3 | Score 2 + stack-specific gotchas documented + native tooling commands (not generic fallbacks) | Score 2 plus "SwiftUI previews require macOS 14+. Use `swift test --filter` for targeted runs. XCTest assertions, not third-party." |

### Red flags
- npm commands in a Swift/Rust/Go project (wrong ecosystem)
- Commands that fail when executed
- Framework version mismatch between CLAUDE.md and actual project
- Generic "run tests" without the actual command

---

## D3 - Workflow Clarity

**Weight**: 1.5x

**What it measures**: does the workspace define a development process with clear phases, gates, and stopping points so the AI knows what to do at each step and when to pause for human review?

### Criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| 3.1 | Development phases are defined (not just "write code and test") | A pipeline, checklist, or phase sequence exists |
| 3.2 | Human review points are explicit | STOP gates, confirmation keywords, or equivalent pause mechanisms |
| 3.3 | Scope definition happens before implementation | Some form of "agree on what to build before building it" |
| 3.4 | Completion criteria are stated | How does the AI (and user) know when a task is done? |
| 3.5 | Process scales to task complexity | Different workflows for trivial fixes vs complex features, or clear escalation rules |

### Scoring

| Score | Definition | Example |
|-------|------------|---------|
| 0 | No workflow defined - the AI operates in freeform mode | No pipeline, no rules about process, no review points |
| 1 | Basic workflow exists but lacks gates or completion criteria | "Plan, implement, test" without stopping points or scope confirmation |
| 2 | Multi-phase workflow with at least 1 explicit human review gate and clear completion criteria | 4+ phases with scope confirmation before coding, test gate before done, outcome checklist |
| 3 | Score 2 + complexity-based routing + intermediate checkpoints + documentation gates | Full pipeline with fast-lane for small changes, STOP gates at scope + outcome, intermediate commits, docs updated before closure |

### Red flags
- No mention of when to stop and ask the user
- "Just do it" workflow with no review points
- Pipeline exists but has no enforcement mechanism (no hooks, no keywords)
- All tasks follow the same heavyweight process (no fast lane)

---

## D4 - Rules Effectiveness

**Weight**: 1x

**What it measures**: are the rules (instructions, constraints, conventions) specific enough to change the AI's behavior, and do they cover the project's actual risk areas?

### Criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| 4.1 | Rules are specific and verifiable | Each rule can be checked pass/fail (not "write good code") |
| 4.2 | Security rules cover the project's attack surface | Auth, input validation, secrets, data exposure - appropriate to the stack |
| 4.3 | Rules are organized by concern (not one giant file) | Separate files for security, style, git conventions, etc. |
| 4.4 | Critical rules use emphasis markers | MUST, NEVER, IMPORTANT on rules where violation causes real damage |
| 4.5 | No self-evident rules that waste context budget | "Write clean code", "follow best practices", "use descriptive variable names" are absent. Note: what is "self-evident" depends on the AI model's baseline behavior - evaluate against current frontier models. |

### Scoring

| Score | Definition | Example |
|-------|------------|---------|
| 0 | No rules, or only the default CLAUDE.md with no project-specific rules | Empty `.claude/rules/` or no rules directory |
| 1 | Some rules exist but are vague, generic, or not organized | Single file mixing security, style, and process rules. "Always test your code." |
| 2 | Rules are specific, organized by concern, cover security basics | Separate security.md with auth-first rule, input validation requirement. output-style.md with concrete constraints. |
| 3 | Score 2 + rules are verifiable with examples + critical rules use emphasis + no wasted rules | Security checklist with 5 concrete checks per API route. Style rules with specific forbidden patterns and replacements. Zero "write clean code" type rules. |

### Red flags
- "Be careful with security" (vague)
- Rules that Claude already follows by default (wasted tokens)
- Contradictory rules across files
- Security rules missing for a project that handles auth, payments, or PII

---

## D5 - Skills Completeness

**Weight**: 1x

**What it measures**: does the workspace provide reusable workflows (skills, commands, or equivalent) for the project's repetitive tasks, and are they correctly configured for the stack?

### Criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| 5.1 | Repetitive tasks have defined automation | Commit workflow, audit checks, deployment - appropriate to the project's complexity |
| 5.2 | Skills/commands are configured for the actual stack | No placeholder configuration values, correct tool references |
| 5.3 | The right mechanism is used for each type of automation | Skills for auto-triggered workflows, commands for user-invoked actions, rules for always-on instructions |
| 5.4 | Skills that use external tools declare their dependencies | Allowed tools, required MCP servers, or equivalent declarations |

### Scoring

| Score | Definition | Example |
|-------|------------|---------|
| 0 | No skills, commands, or reusable workflows defined | Empty or absent `.claude/skills/` and `.claude/commands/` |
| 1 | Some skills exist but unconfigured or wrong for the stack | Commit skill present but with placeholder test command. Security audit referencing npm when project uses Swift. |
| 2 | Skills cover key workflows, configured for the stack, dependencies declared | Commit skill with real test command. Security audit with correct paths. Arch-audit configured. |
| 3 | Score 2 + skills cover project-specific workflows (not just generic audit) + mechanism selection is correct | Score 2 plus project-specific skills (e.g., migration runner, API contract validator). Commands for user-invoked actions. No misuse of skills where a rule would suffice. |

### Red flags
- Skills referencing tools or paths that don't exist in the project
- Placeholder values in skill configuration (`[DB_SYSTEM]`, `[API_ROUTES_PATH]`)
- All skills are generic - none address project-specific repetitive tasks
- Skills that duplicate what a rule already handles

---

## D6 - Context Economy

**Weight**: 1.5x

**What it measures**: does the workspace respect the AI's context budget? Is information placed in the right file type, loaded at the right time, and free of duplication?

### Criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| 6.1 | CLAUDE.md is within size budget | Count lines: target < 200 (hard limit), optimal < 100 |
| 6.2 | Content passes the removal test | For each CLAUDE.md section: can you find the same information by running a command or reading a standard project file (package.json, README, source code)? If yes, the section is redundant and should be removed. For remaining sections: would removing this cause Claude to make a specific, nameable mistake? |
| 6.3 | Information is in the right file type | Persistent context in CLAUDE.md, path-scoped rules in rules/, on-demand workflows in skills/, enforcement in hooks |
| 6.4 | No duplication across files | Same information not repeated in CLAUDE.md and rules and memory |
| 6.5 | Progressive disclosure used where available | @-imports, path-scoped rules with `paths:` frontmatter, skills loaded on demand |

### Scoring

| Score | Definition | Example |
|-------|------------|---------|
| 0 | No awareness of context constraints - everything dumped in one file or files are bloated | CLAUDE.md is 500+ lines. Or all instructions in a single rules file. |
| 1 | Some separation exists but CLAUDE.md is oversized or contains removable content | CLAUDE.md at 250 lines. Contains code style rules that Claude follows by default. Some rules separated but most in CLAUDE.md. |
| 2 | CLAUDE.md under 200 lines. Rules, skills, and context separated by concern. Minor duplication. | Clear separation: CLAUDE.md for project identity + tech stack + conventions. Rules for pipeline, security, style. Skills for workflows. |
| 3 | Score 2 + CLAUDE.md under 100 lines + removal test passed + @-imports used + zero duplication + path-scoped rules | Lean CLAUDE.md with only what Claude needs every session. Path-scoped rules load only for relevant files. Skills demand-loaded. No information repeated across files. |

### Red flags
- CLAUDE.md over 200 lines (Anthropic-documented degradation threshold)
- README content copy-pasted into CLAUDE.md
- Same rules in both CLAUDE.md and a rules file
- Tutorials, code snippets, or API docs inlined instead of referenced
- Information that Claude can discover by reading the codebase

---

## D7 - Safety Guards

**Weight**: 2x

**What it measures**: does the workspace prevent the AI from taking irreversible actions without human confirmation? Are tests enforced, not just recommended?

### Criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| 7.1 | Test execution is enforced (not optional) | A stop hook, pre-commit hook, or equivalent blocks completion if tests fail |
| 7.2 | Destructive operations are blocked or require confirmation | Force push, database drops, production deploys have explicit guards |
| 7.3 | Secrets are protected | `.env*` in .gitignore, no token patterns in committed files, no credentials in AI memory |
| 7.4 | Human review is required before shared-state actions | Push, PR creation, deployment require explicit user confirmation |
| 7.5 | The stop hook runs the correct test command | Not a placeholder, not a generic `npm test` when the project uses something else |

### Scoring

| Score | Definition | Example |
|-------|------------|---------|
| 0 | No safety guards - the AI can push, delete, and deploy without any gate | No stop hook, no permission deny list, no gitignore for secrets |
| 1 | Basic guards exist but are incomplete or misconfigured | Stop hook present but test command is a placeholder. `.env` in gitignore but no deny list for destructive commands. |
| 2 | Tests enforced via hook, destructive operations denied, secrets protected | Working stop hook with real test command. `permissions.deny` blocks force push and DB drops. `.env*` gitignored. No secrets in CLAUDE.md. |
| 3 | Score 2 + audit logging of tool use + STOP gates in pipeline + secret patterns checked in pre-commit | Score 2 plus PostToolUse audit hook. Pipeline STOP gates at scope and outcome. Pre-commit or context-review checks for token patterns in committed files. |

### Red flags
- No stop hook configured
- Stop hook command is `[TEST_COMMAND]` (unresolved placeholder)
- `permissions.deny` is empty or absent
- `.env` files not in `.gitignore`
- The AI can push to main without confirmation

---

## D8 - Cross-file Coherence

**Weight**: 1x

**What it measures**: do all workspace files reference each other consistently? No broken paths, no contradictions, no orphaned references.

### Criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| 8.1 | File paths referenced in CLAUDE.md and rules exist on disk | Grep for path references, check each one |
| 8.2 | Commands are consistent across files | The test command in CLAUDE.md matches the stop hook matches the pipeline |
| 8.3 | No contradictory instructions across files | Rules in one file don't conflict with rules in another |
| 8.4 | Tier-appropriate content only | No Tier L features (design review, UAT scenarios) in a Tier M workspace, no Tier M overhead in Tier S |
| 8.5 | File references in docs and skills point to real project paths | Skill configurations reference paths that exist, doc templates reference real files |

### Scoring

| Score | Definition | Example |
|-------|------------|---------|
| 0 | Files are disconnected - references are broken, commands contradict each other | Pipeline references `docs/sitemap.md` but the file doesn't exist. Stop hook runs `npm test` but CLAUDE.md says `swift test`. |
| 1 | Most references work but some inconsistencies exist | Test command matches in 3 of 4 locations. One broken doc reference. |
| 2 | All path references valid, commands consistent, no contradictions | Every referenced file exists. Same test command everywhere. No conflicting rules. |
| 3 | Score 2 + an automated check exists for coherence + tier boundaries respected | Score 2 plus context-review checks (C8, C10) or equivalent. Workspace uses only features appropriate to its governance tier. |

### Red flags
- Test command differs between CLAUDE.md, stop hook, and pipeline
- References to files from a different tier or a different project
- Skills configured for a different stack than the project uses
- Memory files reference docs that were deleted or renamed

---

## Score Sheet

Copy and fill for each evaluation run.

```
Project: _______________
Date: _______________
Evaluator: _______________
Workspace tool: _______________ (Tierward / manual / other)
Tier (if applicable): _______________

| Dim | Score (0-3) | Weight | Weighted | Key gaps | Attribution (T/U/D) |
|-----|-------------|--------|----------|----------|---------------------|
| D1  |             | 1.0    |          |          |                     |
| D2  |             | 1.0    |          |          |                     |
| D3  |             | 1.5    |          |          |                     |
| D4  |             | 1.0    |          |          |                     |
| D5  |             | 1.0    |          |          |                     |
| D6  |             | 1.5    |          |          |                     |
| D7  |             | 2.0    |          |          |                     |
| D8  |             | 1.0    |          |          |                     |
|-----|-------------|--------|----------|----------|---------------------|
| TOT |             |  10.0  |    /30   |          |   ___%              |

Final score: (weighted total / 30) x 100 = ___%
```

## Interpretation Guide

| Range | Rating | Meaning |
|-------|--------|---------|
| 0-30% | Unusable | Workspace does not provide meaningful AI guidance. Rebuild from scratch. |
| 31-50% | Minimal | Basic structure exists but significant gaps reduce AI effectiveness. Priority: fill placeholders, add safety guards. |
| 51-70% | Functional | Workspace works for routine tasks. Gaps in edge cases, context economy, or cross-file coherence. |
| 71-85% | Good | Workspace actively improves AI output quality. Minor optimization opportunities remain. |
| 86-100% | Excellent | Workspace is a force multiplier. AI operates with high autonomy and low error rate. Maintain through regular review. |

## Action Priority

When gaps are found, prioritize fixes in this order:

1. **P1 - Blocks utility**: Score 0 on D7 (Safety) or D2 (Tech Grounding). Fix immediately - the workspace is actively dangerous or non-functional.
2. **P2 - Reduces quality**: Score 0-1 on D1 (Identity), D3 (Workflow), D6 (Economy). The AI works but makes avoidable mistakes or wastes context.
3. **P3 - Optimization**: Score 1-2 on D4, D5, D8. The workspace functions but could be tighter.

---

## Changelog

- **v1.0** (2026-04-03): Initial version. 8 dimensions, weighted scoring, gap attribution model. Anchored to Anthropic official documentation (code.claude.com/docs), context engineering blog, Tierward v1.6.1 template analysis, and cross-tool community patterns.
