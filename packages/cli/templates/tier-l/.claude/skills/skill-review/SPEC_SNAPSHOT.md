# Anthropic Claude Code Spec Snapshot (P4)

**Version**: 1.0
**Snapshot date**: 2026-04-14
**Bundled with**: `/skill-review` skill (for export to user projects)
**Status**: frozen reference for the current review cycle. This file is the single source of truth on Anthropic's skill spec for the duration of the cycle, even if upstream docs change mid-cycle (see Update policy).

**Canonical sources** (as consulted on snapshot date):
- https://code.claude.com/docs/en/skills
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview

**Scope**: this document captures the spec facts only. Operational checks derived from this spec live in P1 (`anthropic-spec-checklist.md`).

---

## 1. Frontmatter - required fields

| Field | Constraint |
|---|---|
| `name` | Present, ≤ 64 chars, lowercase letters + digits + hyphens. Regex `^[a-z][a-z0-9-]{0,63}$`. |
| `description` | Present (strongly recommended), ≤ 1024 chars. |

---

## 2. Frontmatter - optional fields

Every field below is **documented by Anthropic**. Fields outside this list are forbidden.

| Field | Type | Purpose / valid values |
|---|---|---|
| `allowed-tools` | string OR list | Subset of tools the skill can invoke. Space-separated string or YAML list. Tierward convention: space-separated string. |
| `model` | string | Model identifier: `sonnet`, `haiku`, `opus`. |
| `context` | string | Only documented value: `fork`. |
| `agent` | string | Subagent type: `Explore`, `Plan`, `general-purpose`. |
| `when_to_use` | string | Additional discovery hint. Combined with `description` must be ≤ 1536 chars. |
| `paths` | list | YAML list of glob patterns restricting where the skill activates. |
| `user-invocable` | boolean | Whether user can invoke via `/skill-name`. |
| `disable-model-invocation` | boolean | Whether Claude may auto-invoke the skill. |
| `hooks` | object | Lifecycle hook registration (no Tierward skill currently uses this). |
| `shell` | string | `bash` or `powershell`. |
| `argument-hint` | string | Free text, hint for argument structure. |
| `version` | string | Informal version string. |

**Conflict rule**: `disable-model-invocation: true` + `user-invocable: false` produces an unreachable skill.

---

## 3. Non-documented fields - forbidden

Any frontmatter key outside the required + optional set above is a spec violation.

**Known non-documented fields present in Tierward at snapshot date**:
- `effort` - on 6 files: `arch-audit` (S, M, L) and `security-audit` (S, M, L). To be removed during the review cycle.

---

## 4. Numerical limits

| Limit | Value | Scope |
|---|---|---|
| SKILL.md line count | ≤ 500 lines (recommended) | Per file |
| Post-compaction budget | 5,000 tokens | Per skill (first 5k reattached) |
| Post-compaction combined budget | 25,000 tokens | All skills in the bundle |
| `name` length | ≤ 64 chars | Per skill |
| `description` length | ≤ 1024 chars | Per skill |
| `description + when_to_use` combined | ≤ 1536 chars | Per skill |

---

## 5. Runtime substitutions

Always available in skill body:

| Syntax | Meaning |
|---|---|
| `$ARGUMENTS` | Full argument string passed after the skill name. |
| `$0`, `$1`, ... `$N` | Positional arguments. |
| `${CLAUDE_SESSION_ID}` | Current session identifier. |
| `${CLAUDE_SKILL_DIR}` | Skill directory (for referencing local resources). |

**Strict syntax**: `$ARGUMENTS` not `${ARGUMENTS}`. Mismatched braces cause silent non-substitution.

---

## 6. Dynamic context injection

Backtick-bang syntax for pre-render command execution:

```
 !`command`
```

Runs the command before the skill body is attached to the prompt. Output is interpolated into the body.

**Optional feature** - not required for most audit skills.

---

## 7. Supporting files pattern (progressive disclosure)

Documented pattern when a skill exceeds ~300 lines of core content:

- Core `SKILL.md` (< 300 lines): pipeline, execution logic, explicit references.
- Supporting files (`REFERENCE.md`, `EXAMPLES.md`, `FORMS.md`, etc.): detail loaded on demand.
- Supporting files must be referenced explicitly in `SKILL.md` with load instructions.

---

## 8. Mid-cycle update procedure

If Anthropic publishes spec changes between this snapshot date and the end of the review cycle:

1. **Do not silently update** this snapshot. Changes break comparability across the cycle.
2. **Decision gate**: evaluate impact. Two outcomes:
   - **Non-breaking** (new optional field, non-mandatory constraint relaxation): log in `MID_CYCLE_DELTA.md`, complete the cycle against this snapshot, integrate in next snapshot version.
   - **Breaking** (field renamed, new required field, mandatory constraint tightened): bump this snapshot to v1.1, re-run P1 checklist on every already-reviewed skill. Count this as a framework-level event triggering retroactive re-application per `review-framework.md`.
3. **Either way**: document the decision with the publication date of the Anthropic change + the Tierward review date + rationale for non-breaking-vs-breaking classification.

---

## 9. Known ambiguities (flagged at snapshot date)

| Topic | Ambiguity | Tierward resolution |
|---|---|---|
| `allowed-tools` separator | Both space-separated and YAML list documented as valid | Tierward standard: space-separated string |
| `hooks` object schema | Documented but no schema reference at canonical URLs | Not used in any Tierward skill; no validation enforced until first use |
| `shell` default | Unclear whether `bash` is implicit when field is absent | Tierward behavior: absent field means no shell restriction |
| Combined compaction budget | 25,000 tokens combined, but behavior when exceeded is unspecified | Treat as hard fail; run tokenizer check in P1 C5 |

---

## Versioning

Bump this snapshot when:
- A new Anthropic spec version is published and adopted.
- A mid-cycle breaking change is resolved (per §8).

On bump: update `Snapshot date`, increment `Version`, preserve previous snapshot in `archive/spec-snapshot-vN.md`, log delta in `MID_CYCLE_DELTA.md`.
