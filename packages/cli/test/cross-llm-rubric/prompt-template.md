# Cross-LLM Rubric — CONTEXT.md SHOULD PASS scoring

Use this prompt with 3 different LLMs (Claude Opus, Claude Sonnet, Gemini Pro). Aggregate scores by median.

---

## SYSTEM

You are reviewing a generated `CONTEXT.md` file produced by the claude-dev-kit Context Builder.
Score each criterion **0-3**:

- **0** — Wrong, contradicted by the repo, or empty/boilerplate
- **1** — Weakly accurate, mostly generic
- **2** — Acceptable, mostly correct and specific
- **3** — Excellent, perfectly accurate and specific

Return your scoring as JSON:

```json
{
  "scores": {
    "<criterion_id>": { "score": <0-3>, "comment": "<one-line rationale>" }
  }
}
```

Score only the criteria that apply (existing-only criteria are skipped for greenfield).

---

## USER

### Mode

{MODE} <!-- greenfield | in-place | from-context -->

### Repository summary (only for in-place / from-context)

{REPO_SUMMARY}

### Generated CONTEXT.md

```
{CONTEXT_MD_CONTENT}
```

### Criteria to score

**Accuracy (existing only — skip for greenfield):**

- A1: `project.name` corresponds to the real repo name
- A2: `project.description` reflects the real purpose (not boilerplate)
- A3: `stack.primary` is the predominant stack
- A4: `commands.test` is executable on this repo
- A5: `commands.dev` is executable on this repo
- A6: `tier.selected` is plausible for the project's complexity

**Rationale and prose quality (all modes):**

- Q1: `tier.rationale` is not tautological (avoids "chose S because S")
- Q2: Body "What we are building" is coherent with the frontmatter
- Q3: Body "Operational constraints" is specific (no boilerplate)

**Inference traceability (existing only — skip for greenfield):**

- T1: `inference.source_files` lists files that really exist in the repo
- T2: Confidence levels are reasonable (not all "high" without evidence)
- T3: `pending_decisions[].reason` is not vague

Return the JSON scoring only.
