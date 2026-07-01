# Agent and Workflow Patterns for Skills

Skills in Tierward can do more than run sequentially in the main session. Two tools — the `Agent` tool and the `Workflow` tool — let a skill split work across isolated sub-agents with separate context windows. This document explains when and how to use each.

---

## context: fork

Every skill that ships with Tierward declares `context: fork` in its frontmatter:

```yaml
---
name: my-skill
context: fork
---
```

This tells the Claude Code harness to run the skill in an isolated context window, separate from the main project session. The skill's token budget starts clean; nothing from the main session bleeds in, and the skill's intermediate steps do not fill the session window.

`context: fork` is mandatory — arch-audit check C13 fails any skill missing it.

---

## The Agent tool: spawning sub-agents from within a skill

Within a skill body, you can spawn one or more sub-agents using the `Agent` tool. Each sub-agent runs in its own context window, receives a focused prompt, and returns its result to the orchestrating skill.

### When to use

Use the Agent tool when a skill needs to delegate a focused, bounded sub-task — a read-only scan, a structured analysis pass, or a review that must stay neutral to the skill's own reasoning.

The pattern:
- The orchestrator prepares context (reads files, fetches diff, loads config)
- It writes relevant data to disk so the subagent can read it by path — never inline large content
- It spawns the subagent with a tight prompt
- The subagent returns text or structured output
- The orchestrator synthesizes and acts on the result

### Live example: /pr-review (explicit review subagent)

`/pr-review` is the clearest example of the Agent tool in a skill. In Step 4, the skill spawns a dedicated review subagent.

The orchestrator does the groundwork — resolves the repo, fetches the diff to disk, loads severity config, reads `CLAUDE.md` — then composes a prompt for the subagent. The subagent receives paths, not raw content. It reviews, returns a markdown report. The orchestrator posts the comment. The user decides the merge; the Agent never calls `gh pr merge`.

Three hard constraints the skill enforces on the subagent:
- Pass the diff path; the subagent reads from disk (never inline 50 000-line diffs)
- The subagent must not post the comment, edit files, or run any mutation command — read-only only
- Merge is always a human decision

### Live example: /skill-dev (background Explore agent)

`/skill-dev` shows a different Agent pattern — a background agent launched immediately so the main skill's sequential judgment checks run in parallel:

```
## Step 2 - Launch Explore agent in background
Launch immediately with `run_in_background: true`, then proceed to Step 3 without waiting.
```

The orchestrator starts a Haiku Explore agent in the background, then proceeds with its own structural checks (J1–J5). In Step 4 it waits for the background agent before producing the combined report.

Running the agents in parallel cuts wall-clock time roughly in half compared to sequential execution. The cost is low because the background pass uses Haiku.

---

## The Workflow tool: deterministic multi-agent orchestration

The Workflow tool is a different abstraction. Instead of spawning agents imperatively from a skill body, you write a self-contained JavaScript script that the harness executes. The script expresses control flow that would be too complex to describe in natural language — loops, conditionals, fan-out over variable-length inputs.

Core script API:

- `agent(prompt, opts)` — spawn an agent, await its result
- `pipeline(items, ...stages)` — run each item through all stages without barriers; the default choice for multi-step work
- `parallel(thunks)` — run tasks concurrently and await all (use only when stage N genuinely needs every stage N-1 result before it can proceed)
- `phase(title)` — group subsequent `agent()` calls under a named phase in the progress display
- `schema` option — pass a JSON Schema to `agent()` to force structured output; the harness validates and retries on mismatch

### When to use

Use the Workflow tool when:
- Control flow must be deterministic — loops, conditionals, fan-out over a known list
- Agent count scales with input size (one verification agent per finding, for example)
- Resume after interruption matters — `resumeFromRunId` replays completed agents from cache
- The orchestration logic is too complex to express in natural language inside a skill body

### Script structure

```javascript
export const meta = {
  name: 'my-workflow',
  description: 'One-line description shown in the permission dialog',
  phases: [
    { title: 'Find', detail: 'scan files for issues' },
    { title: 'Verify', detail: 'adversarially verify each finding' },
  ],
}

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, file: { type: 'string' } },
        required: ['title', 'file'],
      },
    },
  },
  required: ['findings'],
}

const DIMENSIONS = [{ key: 'bugs', prompt: '...' }, { key: 'perf', prompt: '...' }]

// pipeline: dimension A starts verifying while dimension B is still scanning
const results = await pipeline(
  DIMENSIONS,
  d => agent(d.prompt, { label: `find:${d.key}`, phase: 'Find', schema: FINDINGS_SCHEMA }),
  review => parallel(review.findings.map(f => () =>
    agent(`Adversarially verify: ${f.title}`, { label: `verify:${f.file}`, phase: 'Verify' })
      .then(verdict => ({ ...f, verdict }))
  )),
)

const confirmed = results.flat().filter(Boolean).filter(r => r.verdict?.includes('confirmed'))
return { confirmed }
```

Key invariants:
- `meta` must be a pure literal — no variables, template strings, or function calls
- `pipeline()` is the default; `parallel()` only when stage N genuinely needs all of stage N-1 together
- Pass timestamps via `args`, not `Date.now()` — `Date.now()` throws (breaks resume)
- Concurrent agent calls are capped at min(16, cpu cores − 2); excess queues automatically

---

## Agent vs Workflow: decision guide

| Criterion | Agent tool (in skill body) | Workflow tool |
|---|---|---|
| Control flow | Imperative, model-driven | Deterministic JS (loops, conditionals) |
| Agent count | Fixed or small | Scales with input size |
| Resume after interruption | No | Yes (`resumeFromRunId`) |
| Structured output | Via prompt contract | Via `schema` option (validated by harness) |
| Best for | Bounded sub-tasks within a skill | Fan-out over a list, multi-phase pipelines |

---

## Trade-offs

**Agent tool in a skill body**
- Simpler to author — the orchestration logic lives in the SKILL.md prose
- Sub-agent gets a clean context window; the main skill's window stays uncluttered
- No resume: if the skill is interrupted, the whole skill reruns from scratch
- Useful for delegating a single bounded pass (a review, a scan, an analysis) that must stay neutral to the orchestrator's own reasoning

**Workflow tool**
- Resume support is the main advantage for long pipelines: completed agents are cached and replayed on resume
- `schema`-validated output removes manual JSON parsing; the harness retries automatically
- `pipeline()` provides true stage overlap — not stage-by-stage barriers — which cuts wall-clock time significantly
- Higher setup cost: requires a standalone script with explicit `meta`
- Pure JS only — no TypeScript annotations, no `Date.now()`, no filesystem access outside agents

---

## Authoring checklist

When adding agent or workflow patterns to a new skill:

- [ ] Skill frontmatter declares `context: fork`
- [ ] Large inputs passed as paths, not inline content
- [ ] Sub-agents are read-only: no mutations, no commits, no merges
- [ ] Background agents (`run_in_background: true`) have an explicit wait point before results are consumed
- [ ] Workflow `meta` is a pure literal — no computed values
- [ ] `pipeline()` used by default; `parallel()` only where a barrier is justified
- [ ] `schema` used for structured output to avoid parsing fragility
