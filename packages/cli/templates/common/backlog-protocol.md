# Backlog write-once protocol

Audit findings are persisted to `docs/refactoring-backlog.md`. When several audits run in one block (pipeline Phase 5d), each independently reading, deduping, and rewriting that file is wasteful — the shared file is read and rewritten once per source. This protocol consolidates those writes: within a block, findings accumulate to block-local session scratch; the shared file gets **one** write at closure.

Skills reference this file at the point where they would otherwise write the backlog. The rule is defined **once here** — do not duplicate the branch logic into each skill.

## The rule

When an audit skill has **approved** findings to persist (after its own interactive backlog decision gate):

- **In an active block** — a `.claude/session/block-*.md` session file exists: append the approved entries to the session scratch `.claude/session/refactoring-findings.md` (create it if absent). Do **not** write `docs/refactoring-backlog.md` mid-block. The single consolidated write happens at block closure (pipeline Phase 8).
- **Standalone** — no active block session (the skill was invoked on its own, outside a pipeline block): write the approved entries **directly** to `docs/refactoring-backlog.md`, exactly as before. **This fallback is mandatory:** a standalone run has no closure step to flush the scratch, so skipping the direct write would silently drop the findings.

Detection: check for a `.claude/session/block-*.md` file. Present → in-block (append to scratch). Absent → standalone (direct write).

## Scratch format

Append each approved finding to `.claude/session/refactoring-findings.md` with the same fields the backlog uses: the skill's own ID prefix (`SEC-`, `PERF-`, `DB-`, `API-`, `MIG-`, `A11Y-`, `DEV-`, `UX-`, `DOC-`, `INFRA-`, …), severity, `file:line`, a one-line description, and the detail block. Leave the numeric ID unassigned (`SEC-?`) — closure assigns final backlog IDs during consolidation so numbering stays contiguous across all sources.

**Reconciling a skill's own write instructions.** Each skill's write step lists sub-steps like "assign ID `SEC-[n]`", "add to the priority index", "add the full detail section". Those describe the **final consolidated write** to `docs/refactoring-backlog.md`. In-block, they are deferred to the closure flush: capture the finding, its prefix, severity, `file:line`, and detail block to the scratch, and leave **numeric ID assignment and priority-index placement to closure** (the scratch has no priority index). Standalone, the sub-steps apply directly as written (there is no closure, so the skill assigns the ID and writes the index itself).

**Deduping / counting in-block.** Several skills read `docs/refactoring-backlog.md` to avoid duplicate reporting, and `skill-dev` counts open entries per module for debt-density escalation. In an active block, this block's own findings are in the scratch, not yet in the backlog — so when deduping or counting **in-block, read `.claude/session/refactoring-findings.md` in addition to `docs/refactoring-backlog.md`**. Standalone, the backlog alone is authoritative.

## Closure flush (pipeline Phase 8)

Once per block, at closure, a single step:
1. Read `.claude/session/refactoring-findings.md`. If absent or empty, nothing to flush — skip.
2. Dedupe against existing `docs/refactoring-backlog.md` entries (same file:line + same check → not a new entry).
3. Assign final contiguous IDs per prefix and write the consolidated set to `docs/refactoring-backlog.md` in **one** pass.
4. Delete the scratch file.

## Every source (enumerate — a missed writer leaks a write)

The all-or-nothing property: any finding-writing skill that still writes `docs/refactoring-backlog.md` directly mid-block defeats the consolidation. These skills persist findings and MUST follow this protocol:

`accessibility-audit` · `api-contract-audit` · `api-design` · `compliance-audit` · `doc-audit` · `infra-audit` · `migration-audit` · `perf-audit` · `security-audit` · `skill-db` · `skill-dev` · `test-audit` · `ui-audit` · `ux-audit` · `pr-review`

When a new finding-writing skill is added, **add it here and wire it** to this protocol in the same change.

## Tiers

Applies where a block + closure exist (Tier M / Tier L). Tier S (Fast Lane) has no Phase-8 closure; its skills always take the standalone branch (direct write) — correct by construction, nothing to wire there.
