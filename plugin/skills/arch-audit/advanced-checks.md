# Advanced compliance checks

Reference file for `arch-audit`. Contains Step 3c (Anthropic Prompting Guide compliance), Step 3d (Token & subagent optimization), and Step H1 (Hook compliance). Extracted from `SKILL.md` to respect the Anthropic best-practice budget of ≤ 500 lines per skill body. Load this file when executing the corresponding steps; otherwise the content costs zero tokens.

## Step 3c - Anthropic Prompting Guide compliance

Using the prompting guide content fetched in Step 1 **and the normative baseline in `.claude/rules/claudemd-standards.md`** (read in Step 2), evaluate `CLAUDE.md`, `pipeline.md`, and `context-review.md` against best practices. The standards file is the local stable reference - use it as the primary benchmark; live-fetched docs confirm it's still current. These checks are judgment-based - classify each as PASS or WARN (not hard FAIL), and always RECOMMEND, never auto-fix.

**Standards file currency check (run first)**: compare the `Last verified` date in `.claude/rules/claudemd-standards.md` against today's date. If > 30 days old AND Step 1 fetched new material changes → flag as RECOMMEND to update the standards file. If ≤ 30 days → skip.

**P1 - CLAUDE.md content type (Anthropic's inclusion test)**
Anthropic's rule: CLAUDE.md should contain ONLY non-obvious information Claude cannot infer by reading the code. Apply Anthropic's own test to every section: _"Would removing this cause Claude to make mistakes?"_

Flag as WARN if a section:

- Describes what a file does structurally (e.g. "file X handles Y") without explaining a non-obvious constraint - Claude can read the code
- States a standard convention Claude already knows without a project-specific reason
- Contains tutorial-style explanations of concepts (React, TypeScript, SQL) that Claude understands natively
- Describes current session state or temporary phase status (this belongs in CLAUDE.local.md or MEMORY.md)

Report: list any sections that fail the test with a suggested action (remove, condense, or move to a more appropriate file).

**P2 - Instruction clarity and actionability**
Anthropic's guidance: instructions must be specific, actionable, and unambiguous. A vague rule gives Claude discretion where a concrete rule would remove ambiguity.

Flag as WARN:

- Directives with no measurable outcome ("be thorough", "be careful", "verify appropriately")
- Instructions that say "ensure X" without specifying how to verify X
- Rules with implicit scope ("update relevant files") where an explicit list would prevent errors

Report: flagged instances with suggested sharper wording.

**P3 - Structural redundancy across instruction files**
Redundancy dilutes attention. If a rule appears in both CLAUDE.md and pipeline.md with no clear canonical source, Claude may apply it inconsistently - or the longer file may suppress the shorter one.

Check: read "Known Patterns" in CLAUDE.md and "Cross-Cutting Rules" in pipeline.md side-by-side. Also check for overlap between context-review.md checks and arch-audit C1–C17.

Flag as WARN: any rule stated substantively in two files where one should be canonical.

Report: duplicates with a recommendation on which file is the correct owner.

**P4 - Pipeline complexity proportionality**
Anthropic's principle: instruction complexity should be proportional to the actual risk and value it protects against. Over-specified pipelines make Claude slower and more likely to get stuck on process rather than output.

Evaluate:

- Are there phases (or sub-phases) whose STOP gate catches errors that have actually occurred in practice? Or are they theoretical?
- Does the Fast Lane meaningfully simplify, or does it mostly duplicate the full pipeline?
- Are there context-review checks (C1–C12) that have never caught a real issue - suggesting they address a risk that doesn't materialize?
- Does the total length of pipeline.md + context-review.md stay within a range where Claude can hold the key constraints in working context?

Report: any phase or check that appears to add friction without demonstrated value → RECOMMEND for review or consolidation. Note: do NOT recommend removing STOP gates without strong evidence of zero value - gates protect against irreversible actions.

**P5 - Long context structure and scannability**
Anthropic guidance for long system prompts: critical rules should be visually distinct and easy to locate. Recency and position matter - Claude gives more weight to recent context.

Check:

- Are the most-critical, most-referenced rules (RBAC, worktree isolation, migration isolation, environment isolation) marked as CRITICAL or placed at the top of their sections?
- Is CLAUDE.md structured so Claude can find a rule without reading the entire file?
- Are there sections that are rarely referenced but consume significant token space in every context window?

Report: structural improvements for scannability → RECOMMEND.

## Step 3d - Token & subagent optimization checks

These checks audit the project's own efficiency at model selection and subagent delegation. Regressions here increase cost and latency without improving output quality. Judgment-based where noted; mechanical checks reuse the grep-tier haiku batch from Step 3b.

**T1 - Research agent model in arch-audit Step 1**
Check: does the Step 1 instruction in this SKILL.md specify `model: haiku` for the research agent?
Batch command: `grep -n "model.*haiku\|haiku.*model" .claude/skills/arch-audit/SKILL.md`
Expected: at least 1 match in the Step 1 section. Missing = FAIL.
AUTO-FIX: add `(model: haiku)` to the research agent invocation in Step 1.

**T2 - Haiku model on all Explore subagents across skills**
Check: every "Launch ... Explore subagent" instruction in all SKILL.md files must explicitly name `model: haiku`.
Batch command: `grep -rn "Explore subagent" .claude/skills/*/SKILL.md | grep -v "model.*haiku\|haiku"`
Expected: 0 matches (all invocations already name haiku). Any match = FAIL.
AUTO-FIX: append `(model: haiku)` to the invocation description in each failing line.

**T3 - Phase 5d Playwright concurrency note**
Check: does pipeline.md Phase 5d document that `/ui-audit` (static, no Playwright by default) can run concurrently with Playwright-based skills, and that `/visual-audit`, `/ux-audit`, `/responsive-audit` must run sequentially (shared MCP Playwright session)?
Batch command: `grep -A30 "Phase 5d" .claude/rules/pipeline.md | grep -i "concurrent\|parallel\|sequenti\|playwright.*conflict\|conflict.*playwright"`
Expected: at least 1 match. Missing = WARN.
RECOMMEND if failing: add a note to Phase 5d: "Run `/ui-audit` concurrently with the first Playwright skill launch. Run `/visual-audit` → `/ux-audit` → `/responsive-audit` sequentially - they share the MCP Playwright session and cannot run in parallel."

Batch commands:
Expected: ≥1 match in each file. Missing from either = FAIL.

**T5 - Skill model fitness (judgment)**
For each skill, verify `model:` frontmatter fits the task's reasoning requirement:

- `model: haiku` appropriate for: mechanical structural checks, pure grep/pattern matching, URL text extraction, formatting validation
- `model: sonnet` appropriate for: cross-file judgment, complex analysis, fix application, multi-dimension scoring
- `model: opus` appropriate for: screenshot-based visual reasoning, multi-role journey simulation, live aesthetic scoring - requires vision + deep analysis

Current expected state:
| Skill | Expected | Rationale |
|---|---|---|
| arch-audit | sonnet | Complex judgment, cross-doc analysis, AUTO-FIX application |
| ui-audit | sonnet | Design system judgment, visual compliance scoring |
| ux-audit | opus | Multi-flow simulation + live screenshot analysis - visual reasoning requires Opus |
| visual-audit | opus | 7-dimension aesthetic scoring + screenshot analysis - visual reasoning requires Opus |
| security-audit | sonnet | Exploit reasoning, authorization analysis |
| api-design | sonnet | REST pattern judgment + internal haiku Explore agent |
| perf-audit | sonnet | Bundle analysis, server/client boundary judgment + internal haiku Explore agent |
| skill-dev | sonnet | Coupling/abstraction judgment + internal haiku Explore agent |
| skill-db | opus | Deep schema normalization + RLS policy reasoning requires Opus - internal haiku Explore agent for dep scan |
| responsive-audit | opus | Multi-viewport screenshot judgment - visual reasoning requires Opus |

Batch command: `grep -A1 "^name:" .claude/skills/*/SKILL.md | grep "model:"` - compare each result against the table above.
FAIL: any skill using `model: haiku` as top-level model (only Explore _subagents within_ skills should use haiku, not the skill itself).
WARN: any skill using `model: opus` **unless** it is one of the intentional Opus skills: `visual-audit`, `ux-audit`, `responsive-audit` (screenshot-based visual reasoning) or `skill-db` (deep schema normalization + RLS policy reasoning). All other skills should use sonnet.

## Step H1 - Hook compliance check

Using hook documentation fetched in Step 1 (`https://code.claude.com/docs/en/hooks`) and `settings.json` read in Step 2, verify the project's hook configuration against current Anthropic spec.

**H1a - Event name currency**
Check: every event name in `settings.json` hooks matches the current official event list.
Run: `grep -o '"SessionStart"\|"SessionEnd"\|"UserPromptSubmit"\|"UserPromptExpansion"\|"PreToolUse"\|"PostToolUse"\|"PostToolUseFailure"\|"Stop"\|"StopFailure"\|"PermissionRequest"\|"PermissionDenied"\|"SubagentStart"\|"SubagentStop"\|"TaskCreated"\|"TaskCompleted"\|"TeammateIdle"\|"FileChanged"\|"CwdChanged"\|"ConfigChange"\|"PreCompact"\|"PostCompact"\|"InstructionsLoaded"\|"Notification"\|"Elicitation"\|"ElicitationResult"\|"WorktreeCreate"\|"WorktreeRemove"' .claude/settings.json | sort -u`
Pass: all events appear in the Step 1 documentation. Any unrecognized event → RECOMMEND removal or rename.

**H1b - JSON response field compliance (prompt hooks)**
For each hook with `"type": "prompt"` in settings.json: check that response fields (`ok`, `reason`, `decision`, `updatedInput`) match the documented schema.
Source: Step 1 hooks doc content.
If divergence found → RECOMMEND (never AUTO-FIX): specify both files that need updating:

- `.claude/settings.json` - the hook prompt inline text (authoritative)
- `.claude/rules/prompt-quality-rubric.md` - the "Block output format" section (documentation, follows the hook)

**H1c - Bypass mechanism visibility**
Check: every `UserPromptSubmit` hook with `type: prompt` that can return a blocking response (`ok: false`) must include bypass instructions in the `reason` field.
Fail → RECOMMEND update to add bypass instructions.

**H1d - Hook type fitness**
For each hook, verify `type` matches intent:

- `command` - shell execution, dynamic state (git, files, env)
- `prompt` - static/contextual text injection, no shell needed
- `agent` - multi-step async logic
  Flag as RECOMMEND (not AUTO-FIX) any `command` hook that only outputs static text and could be simplified to `prompt`.

**H1e - Rubric-hook drift check**
Check: `.claude/rules/prompt-quality-rubric.md` must stay in sync with the inline logic in the `UserPromptSubmit` prompt hooks in `settings.json`. Drift = the rubric documents behavior that the hook no longer implements (or vice versa).

Run these two greps and compare results:

- T3 wildcards in rubric: `grep "T3" .claude/rules/prompt-quality-rubric.md`
- T3 wildcards in hook: `grep "T3" .claude/settings.json`

Also check output format sync:

- Rubric block format: `grep -A5 "Block output format" .claude/rules/prompt-quality-rubric.md`
- Hook output format: look for the `If a trigger matches` instruction in the settings.json hook prompt

Pass: T3 wildcard lists match; rubric output format matches hook output format structure.
Fail → AUTO-FIX: update the rubric to match the hook (hook is authoritative - rubric is documentation). Update `Last updated` date in rubric.

**H1f - New events to consider**

Add results to Step 6 report under:

```
### Hook compliance (H1a–H1e)
- H1a Event name currency: [PASS/FAIL - list unknown events if any]
- H1b JSON response fields: [PASS/FAIL - list non-compliant fields if any]
- H1c Bypass visibility: [PASS/FAIL - list hooks missing bypass guidance]
- H1d Hook type fitness: [PASS/WARN - list command→prompt candidates]
- H1e Rubric-hook drift: [PASS/FAIL - list any T3 or format divergences found]
- H1f New events: [list relevant new events, or "none since last audit"]
```
