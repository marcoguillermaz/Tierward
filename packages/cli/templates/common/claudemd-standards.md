# CLAUDE.md Standards Reference

Last verified: 2026-04-23
Update protocol: update only when `/arch-audit` detects a material change in official sources. Manual review required - no auto-update.

## Sources

| # | Source | Type | URL |
|---|---|---|---|
| 1 | Anthropic Claude Code - Memory docs | First-party | https://code.claude.com/docs/en/memory |
| 2 | Anthropic Claude Code - Hooks docs | First-party | https://code.claude.com/docs/en/hooks |
| 3 | Anthropic Claude Code - GitHub releases | First-party changelog | https://github.com/anthropics/claude-code/releases |
| 4 | Simon Willison | Third-party practitioner | https://simonwillison.net |
| 5 | HumanLayer blog | Third-party practitioner | https://humanlayer.dev/blog |

---

## S1 - Size & density

- **Hard limit**: ≤ 200 lines per CLAUDE.md file. Beyond 200 lines, Anthropic docs state instruction adherence degrades - lower-priority rules get silently ignored. *(Source: 1)*
- **Optimal target**: < 60–100 lines for maximum effectiveness. *(Source: 5, Boris Cherny)*
- **Instruction budget**: frontier models follow ~150–200 instructions reliably. Claude Code's system prompt uses ~50 slots → CLAUDE.md has **100–150 slots available**. Each paragraph-length rule ≈ 3–5 instruction slots. *(Source: 5)*
- **Degradation is uniform**: adding instructions hurts adherence to ALL existing instructions, not just the new ones. Every line added has a cost. *(Source: 5)*
- **Auto memory**: `MEMORY.md` loads only the first **200 lines or 25 KB**, whichever comes first. *(Source: 1)*

---

## S2 - Content filter (what belongs in CLAUDE.md)

Apply this test to every line: **"Would removing this cause Claude to make mistakes?"** If no → remove it. *(Source: 1, 5)*

**MUST include:**
- WHY: project purpose and domain context
- WHAT: tech stack, non-obvious architecture decisions
- HOW: specific commands, verification steps, non-standard patterns

**NEVER include:**
- Code style or linting rules → use hooks/formatters instead (deterministic enforcement) *(Source: 5)*
- Code snippets → use `file:line` references *(Source: 5)*
- Codebase overviews or directory listings → agents discover structure via Glob/Read *(Source: 5)*
- Information derivable from `--help` or from model training data *(Source: 4)*
- Non-universal instructions (apply to < every session) → use `.claude/rules/` with `paths:` scoping *(Source: 5)*
- Current session state or temporary phase status → use `CLAUDE.local.md` or task files *(Source: 1)*
- Tutorial explanations of concepts the model already knows *(Source: 1)*

**Check for contradictions**: conflicting instructions across nested CLAUDE.md files → Claude picks arbitrarily. *(Source: 1)*

---

## S3 - Language & formalism

- **Specific and verifiable**: "Run `[TEST_COMMAND]` before committing" not "Test your changes". "Use 2-space indentation" not "Format code properly". *(Source: 1)*
- **Imperative for critical rules**: MUST / NEVER / ALWAYS on rules where violation causes bugs, security issues, or irreversible actions. *(Source: 1, 5)*
- **Organized sections > dense paragraphs**: markdown headers and bullets outperform walls of text. *(Source: 1)*
- **Periphery bias**: LLMs give more weight to instructions at the **beginning and end** of the file. Put the most critical rules first AND reference them last. *(Source: 5)*

---

## S4 - Progressive disclosure (@-imports and rules/)

- **`@path/to/file`** in CLAUDE.md expands and loads the file into context at launch. Max depth: **5 hops**. *(Source: 1)*
- **Relative paths** resolve from the importing file, not the working directory. *(Source: 1)*
- **Path-scoped rules** (`.claude/rules/`): use `paths:` YAML frontmatter to load rules only when Claude opens matching files - reduces noise, saves context. *(Source: 1)*
  ```yaml
  ---
  paths:
    - "src/api/**/*.ts"
  ---
  ```
- **Skills (`.claude/skills/`)**: load on demand when invoked - NOT at session start. Use for task-specific instructions not needed every session. *(Source: 1, 4, 5)*
- **HTML block comments** (`<!-- ... -->`): stripped before injection - use for maintainer notes without spending context tokens. *(Source: 1)*
- **@-imports survive `/compact`**: CLAUDE.md is re-read from disk and re-injected fresh after every compaction. Instructions given only in conversation (not in CLAUDE.md) are lost. *(Source: 1)*
- **Conditional XML blocks** (HumanLayer pattern): wrap domain-specific sections to reduce activation noise:
  ```xml
  <important if="you are writing or modifying tests">
  - Use `createTestApp()` helper for integration tests
  </important>
  ```
  Keep foundational content (project identity, tech stack) unconditional. *(Source: 5)*

---

## S5 - Hook enforcement

- **Exit 2 = blocking error**: blocks the action, sends stderr to Claude. Use for hard HITL gates. *(Source: 2)*
- **Exit 0 + JSON = structured control**: parse stdout as JSON for `decision`, `additionalContext`, `updatedInput`, etc. *(Source: 2)*
- **NEVER print to stdout** in shell startup files (`.bashrc`, `.zshrc`) - breaks JSON parsing. *(Source: 2)*
- **Stop hook infinite loop guard**: MUST check `stop_hook_active` env var in Stop hooks to prevent infinite loops. *(Source: 2)*
- **`async: true`**: run hook in background without blocking execution - use for notifications, logging. *(Source: 2)*
- **Speed matters**: keep hook execution under a few seconds for fast feedback loops. *(Source: 5)*
- **Run silently on success**: hook stdout/stderr only reaches agent context on failure or when explicitly structured. *(Source: 5)*
- **`InstructionsLoaded` hook**: use exclusively for debugging CLAUDE.md/rules load order - not for general logic. *(Source: 2)*
- **Conditional `if` field** (v2.1.85+): `"if": "Bash(git *)"` uses permission rule syntax to filter hook activations. *(Source: 3)*

**Available hook events (as of v2.1.199 — 30 events):**
`SessionStart` · `Setup` · `UserPromptSubmit` · `UserPromptExpansion` · `PreToolUse` · `PermissionRequest` · `PermissionDenied` · `PostToolUse` · `PostToolUseFailure` · `PostToolBatch` · `Notification` · `MessageDisplay` · `SubagentStart` · `SubagentStop` · `TaskCreated` · `TaskCompleted` · `Stop` · `StopFailure` · `TeammateIdle` · `InstructionsLoaded` · `ConfigChange` · `CwdChanged` · `FileChanged` · `WorktreeCreate` · `WorktreeRemove` · `PreCompact` · `PostCompact` · `Elicitation` · `ElicitationResult` · `SessionEnd`

---

## S6 - MCP servers and instruction budget

- **Each loaded MCP server** consumes **14–22% of the instruction budget** when poorly curated. Disable unused servers. *(Source: 5)*
- **NEVER connect to untrusted MCP servers** - tool descriptions in the system prompt are prompt injection vectors. *(Source: 5)*
- **Prefer CLI over MCP** when a CLI already exists in model training data (GitHub CLI, Docker, databases). *(Source: 5)*
- **`allowed-tools` frontmatter**: skills that call `mcp__*` tools MUST declare those tools in `allowed-tools:` frontmatter to avoid mid-execution permission prompts. *(Source: 2, arch-audit C17)*

---

## S7 - Memory hygiene

- **Auto memory** (`MEMORY.md`): design explicitly for LLM consumption - include update instructions so Claude updates after `/compact`. *(Source: 4)*
- **NEVER put credentials** or production config in auto memory. *(Source: 1)*
- **C6 compliance**: stable patterns belong in CLAUDE.md; auto memory is for session-evolving context. Never duplicate across both. *(Source: context-review.md)*
- **Topic memory files** (`.claude/projects/.../memory/*.md`): NOT loaded at startup - Claude reads on demand only. *(Source: 1)*

---

## S8 - CLAUDE.md delivery mechanism

- CLAUDE.md is injected as a **user message after the system prompt**, wrapped in `<system_reminder>` tags that say the content "may or may not be relevant." This causes Claude to de-prioritize longer files. *(Source: 5)*
- CANNOT be injected at system-prompt level via CLAUDE.md itself - use `--append-system-prompt` CLI flag for scripts/automation requiring system-level enforcement. *(Source: 1)*
- This means **conciseness is the only lever** for improving adherence. Hooks provide true deterministic enforcement. *(Source: 5)*

---

## S9 - Update protocol

This file is updated only when `/arch-audit` (Step 1 WebFetch) detects a material change in official sources. Procedure:
1. `/arch-audit` flags the discrepancy in its report under RECOMMEND
2. User confirms update
3. Relevant section updated with new rule + source citation + date
4. Commit: `chore(context): update claudemd-standards.md - [summary of change]`

**NEVER auto-update** - manual review required to prevent LLM-generated drift.
