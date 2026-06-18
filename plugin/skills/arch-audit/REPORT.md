# Arch Audit - Report Template

```
## Arch Audit - [DATE]
### Claude Code version checked: [version from changelog/releases]
### Current model IDs verified: Opus=[id] · Sonnet=[id] · Haiku=[id]

### Auto-fixed ([N] changes)
- [file]: [what changed and why]

### Recommendations ([N] items)
- [Priority: High/Medium/Low] [description] - [why it matters]

### Decision guide

For each item in Recommendations above, output one decision card in this format:

**[Priority] - [Short title]**
- **Benefit if applied**: concrete outcome in one sentence (measurable or observable)
- **Cost / effort**: what it takes to implement - file count, phase required, risk of regression
- **Verdict**: one of:
  - `Apply now` - clear win, low risk, fits current phase
  - `Defer` - valid but not urgent; include a trigger condition (e.g. "apply when pipeline grows beyond N phases")
  - `Skip` - recommendation is technically valid but does not apply to this project's actual usage patterns; explain why

### Compliant (no action needed)
- [area]: [brief confirmation]

### Ecosystem consistency (C1-C17) - grep-tier via haiku batch, judgment-tier in main context
- C1 Deploy currency: [PASS/FAIL]
- C2 Skill output refs: [PASS/FAIL - batch]
- C3 files-guide static: [PASS/FAIL]
- C4 Symlink alignment: [PASS/FAIL - batch]
- C5 Worktree standard: [PASS/FAIL]
- C6 Dev server prereq: [PASS/FAIL - batch]
- C7 Dead path refs: [PASS/FAIL - list any missing paths]
- C8 Interaction Protocol: [PASS/FAIL]
- C9 STOP gate count: [PASS/FAIL - actual count - batch]
- C10 Worktree isolation: [PASS/FAIL - batch]
- C11 Cheatsheet coverage: [PASS/FAIL - list missing skills if any - batch]
- C12 Hook integrity: [PASS/FAIL - list missing hooks if any + new events worth adding]
- C13 context:fork coverage: [PASS/FAIL - list missing skills if any - batch]
- C14 CLAUDE.md gitignored: [PASS/FAIL - batch]
- C15 CLAUDE.md line budget: [PASS/WARN - actual line count - batch]
- C16 Deprecated model IDs: [PASS/FAIL - list any found - batch]
- C17 allowed-tools frontmatter: [PASS/FAIL - list missing skills if any - batch]

### Prompting compliance (P1-P5) - judgment-based, PASS/WARN only
- P1 CLAUDE.md content type: [PASS/WARN - list any sections failing Anthropic's inclusion test]
- P2 Instruction clarity: [PASS/WARN - list any vague or unmeasurable directives]
- P3 Structural redundancy: [PASS/WARN - list any rules duplicated across files]
- P4 Pipeline complexity: [PASS/WARN - list any phases with unclear value]
- P5 Long context structure: [PASS/WARN - list any scannability or positioning issues]

### Token & subagent optimization (T1-T5)
- T1 Research agent model: [PASS/FAIL - haiku specified in Step 1]
- T2 Explore subagent model: [PASS/FAIL - all haiku, list any missing]
- T3 Phase 5d Playwright concurrency: [PASS/WARN]
- T5 Skill model fitness: [PASS/FAIL/WARN - list any mismatches]

### Pipeline compliance (PE1-PE12) - judgment-based, PASS/WARN only
- PE1 Phase gates integrity: [PASS/WARN]
- PE2 Testing pyramid order: [PASS/WARN]
- PE3 Auth boundary coverage: [PASS/WARN]
- PE4 Type check gate: [PASS/WARN]
- PE5 Security checklist: [PASS/WARN]
- PE6 Staging before production: [PASS/WARN]
- PE7 Migration isolation: [PASS/WARN]
- PE8 Scope gate before impl: [PASS/WARN]
- PE9 Minimal footprint: [PASS/WARN]
- PE10 Fast Lane escalation: [PASS/WARN]
- PE11 Documentation gate: [PASS/WARN]
- PE12 Commit discipline: [PASS/WARN]

### Hook compliance (H1a-H1f)
- H1a Event name currency: [PASS/FAIL - list unknown events if any]
- H1b JSON response fields: [PASS/FAIL - list non-compliant fields if any]
- H1c Bypass visibility: [PASS/FAIL - list hooks missing bypass guidance]
- H1d Hook type fitness: [PASS/WARN - list command->prompt candidates]
- H1e Rubric-hook drift: [PASS/FAIL - list any T3 or format divergences found]
- H1f New events: [list relevant new events, or "none since last audit"]

### Next audit due: [DATE + 7 days]
```

If no gaps are found: output "Architecture fully compliant as of [DATE]. No changes needed." and still update the timestamp.
