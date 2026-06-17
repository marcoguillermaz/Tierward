---
name: external-review
description: Run a fresh-context review of Tierward before a release. --mode=quick spawns a Claude general-purpose subagent with no project memory and an auto-bundled snapshot. --mode=full fans out the same bundle to GPT-4.1, Gemini 2.5 Pro, Mistral Large, and Perplexity Sonar Pro for cross-LLM coverage. Maintainer-only; not shipped to user projects.
user-invocable: true
model: sonnet
context: fork
allowed-tools: Bash Read Write Glob Agent
argument-hint: --mode=quick|full [--focus=<area>]
---

# external-review

Pre-release sanity pass for Tierward. Two modes:

- `--mode=quick` (default) — single fresh-context Claude review. Cost: ~$0.10, ~60 seconds. Use on every release.
- `--mode=full` — cross-LLM (GPT-4.1 / Gemini 2.5 Pro / Mistral Large / Perplexity Sonar Pro) via `scripts/external-review.mjs`. Cost: ~$0.50–2, ~5 minutes. Use at milestones (v2.0, every 4–6 minor releases, before strategic pivots).

## Why two modes

Cross-LLM catches two distinct blind-spot classes: (a) memory-isolation / fresh-eyes — replaceable by a Claude subagent with no transcript context — and (b) architectural diversity from different model families and training corpora. `quick` covers (a) cheaply on every release; `full` adds (b) at milestone gates. Running `full` weekly is wasteful redundancy.

## Configuration

- Prompt source: `docs/reviews/external-review-prompt.md` (single living file, frontmatter `version:` synced to current Tierward release)
- Bundle script: `scripts/external-review-bundle.mjs` (auto-curated: README + CHANGELOG slice + 1 SKILL sample + Tier-M pipeline + roadmap-status)
- Cross-LLM script: `scripts/external-review.mjs` (existing, providers via env keys)
- Output base: `docs/reviews/<YYYY-MM-DD>-<mode>/` (committed; cite in PRs and roadmap entries)

## Steps

### Step 0 — Parse arguments

Parse `--mode` (default `quick`) and `--focus` (default `general`). Accepted modes: `quick`, `full`. Accepted focus tokens: `general`, `architecture`, `competitive-position`, `team-adoption`, `pricing`, `enterprise-readiness`. Unknown focus is allowed — it gets passed through verbatim to the prompt.

### Step 1 — Resolve run directory

Compute `RUN_DIR=docs/reviews/$(date -u +%Y-%m-%d)-<mode>/`. If it already exists, append `-<n>` until unique. Create `RUN_DIR/bundle/` and `RUN_DIR/responses/`.

### Step 2 — Verify prompt freshness

Read frontmatter of `docs/reviews/external-review-prompt.md`. If `version` does not match the current Tierward release (read from `packages/cli/package.json`), STOP and print: "Prompt is stale (prompt={X}, Tierward={Y}). Update docs/reviews/external-review-prompt.md frontmatter and content before running." Do NOT auto-update — the prompt body has Tierward-state numbers that need a human review.

### Step 3 — Auto-bundle

Run `node scripts/external-review-bundle.mjs --out RUN_DIR/bundle/`. Verify exit 0 and that the expected 5 files are present.

### Step 4 — Materialize the prompt

Read `docs/reviews/external-review-prompt.md`, substitute `{VERSION}` → current Tierward version (from `package.json`) and `{FOCUS_AREA}` → the resolved focus token. Write to `RUN_DIR/prompt.md`.

### Step 5a — Quick mode (default)

Use the Agent tool with `subagent_type=general-purpose`. Compose the agent prompt as:

```
You have NO prior memory of the tierward project. The only context you have is the bundle below. Treat any claim not grounded in the bundle as unverified.

[contents of RUN_DIR/prompt.md]

---

BUNDLE FILES (each is a separate file in the same review snapshot):

=== README.md ===
[contents]

=== CHANGELOG.md ===
[contents]

=== security-audit-SKILL.md ===
[contents]

=== pipeline-tier-m.md ===
[contents]

=== roadmap-status.md ===
[contents]
```

Inline the bundle contents (read from `RUN_DIR/bundle/`). Spawn a single agent. Capture its response. Write to `RUN_DIR/responses/claude-fresh.md` with a header line: `## Claude (general-purpose, fresh context) — Tierward <VERSION> — Focus: <FOCUS_AREA> — <ISO date>`.

### Step 5b — Full mode

Run:

```bash
node scripts/external-review.mjs \
  --prompt RUN_DIR/prompt.md \
  --bundle RUN_DIR/bundle/ \
  --out    RUN_DIR/responses/
```

Verify the script's preflight: 0 providers = abort with the printed instruction. 1–3 providers = proceed with the warning the script already prints. 4 providers = full coverage.

### Step 6 — Synthesis

Read every file in `RUN_DIR/responses/`. Produce `RUN_DIR/synthesis.md` with this structure:

```
# Tierward <VERSION> — External Review Synthesis
Date: <ISO>
Mode: <mode>
Focus: <focus>
Reviewers: <comma-separated list>

## Convergence (≥ 2 reviewers agree)
- [point with reviewer attribution]

## Divergence (each reviewer has a unique angle)
- **<reviewer>**: [point]

## Action items (prioritized)
1. [high-leverage, name reviewer who flagged it]
2. ...

## Overall verdict
[SHIP / SHIP-WITH-RESERVATIONS / DO-NOT-SHIP — mode aggregation]
```

Synthesis is markdown only — no JSON, no metrics. The maintainer reads it manually and decides which action items to file as issues.

### Step 7 — Stage for review

Print the path to `RUN_DIR/`, list every file produced, and the suggested `git add` invocation. Do not auto-commit. The maintainer reviews the synthesis, may decide to drop a noisy reviewer, and commits manually.

## Execution notes

- Output directory `docs/reviews/<run>/` is committed by exception in `.gitignore`. Existing legacy artifacts in `docs/reviews/` stay gitignored.
- The skill never edits the prompt file. Stale prompts are surfaced in Step 2 and stop the run by design.
- Quick mode does not require any external API key. Full mode skips providers whose keys are missing and prints a warning per missing provider.
- A milestone run can be reproduced from any commit: prompt + bundle script live in the repo at the commit, so re-running on `git checkout <tag>` yields the same input shape.

## Cost guidance

- `quick` is bounded by Anthropic API pricing on Sonnet-equivalent. Treat as a free pre-release reflex.
- `full` adds 4 external API calls. Mistral and Perplexity are the cheapest; GPT-4.1 and Gemini 2.5 Pro dominate the bill.

## Output

A populated `docs/reviews/<YYYY-MM-DD>-<mode>/` directory and a printed summary. No git commit, no version bump, no modification to other Tierward files.
