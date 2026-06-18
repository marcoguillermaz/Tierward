# Arch-Audit Batch Commands

Exact commands for Step 3b consistency checks. Stored here to keep the SKILL.md body free of implementation patterns (body purity rule).

## Grep-tier batch (haiku subagent)

Pass this entire table to the haiku subagent in Step 3b. Receive one structured pass/fail result per row.

| Check | Command | Pass condition |
| ----- | ------- | -------------- |
| C4    | `grep -n "ln -s" .claude/rules/pipeline.md` | 0 matches |
| C6    | `grep -A3 "Phase 5b" .claude/rules/pipeline.md \| grep -i "dev\|server\|localhost"` | ≥1 match |
| C9    | `grep -c "\*\*\* STOP" .claude/rules/pipeline.md` | ≥5 |
| C10   | `grep -n "Worktree isolation" .claude/rules/pipeline.md` | ≥1 match |
| C11   | `for skill_dir in .claude/skills/*/; do name=$(basename "$skill_dir"); grep -q "$name" .claude/cheatsheet.md && echo "OK: $name" \|\| echo "MISSING: $name"; done` | 0 MISSING lines |
| C12   | `grep -o "SessionStart\|PostCompact\|InstructionsLoaded" .claude/settings.json \| sort -u` | 3 lines |
| C13   | `grep -rL --include="SKILL.md" "context: fork" .claude/skills/` | 0 files returned |
| C14   | `git check-ignore -q CLAUDE.md && echo "PASS" \|\| echo "FAIL"` | PASS |
| C15   | `wc -l CLAUDE.md \| awk '{print $1}'` | ≤200 |
| C16   | `grep -rn "claude-3-haiku\|claude-3-5-haiku\|claude-3-opus\|claude-3-sonnet\|claude-3-5-sonnet\|claude-sonnet-4-20250514\|claude-opus-4-20250514" .claude/skills/ .claude/settings.json` | 0 matches |
| C17   | `for f in .claude/skills/*/SKILL.md; do name=$(basename $(dirname "$f")); [ "$name" = "arch-audit" ] && continue; if grep -q "mcp__" "$f" && ! grep -q "^allowed-tools:" "$f"; then echo "MISSING allowed-tools: $f"; fi; done` | 0 MISSING lines |

## Judgment-tier standalone (C8)

**C8** — not in the batch above because it requires reading the output in context:

`grep -n "Interaction Protocol" CLAUDE.md`

Pass: ≥1 match. Missing = FAIL.
