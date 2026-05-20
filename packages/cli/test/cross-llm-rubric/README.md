# Cross-LLM rubric — SHOULD PASS scoring for CONTEXT.md

Automated execution of the rubric locked in
`memory/project_context_builder_rubric_v1.md` (2026-05-07). Replaces the
manual pilot procedure used at the v1.0 release.

## When to run

Pre-release of any version that touches Context Builder, schema,
prompt templates, or inference. Optional in CI on PRs that change
`packages/cli/src/context-builder/**`.

This is a **maintainer-side gate**, not an end-user command. Users get
the deterministic 16 MUST PASS via `validate-context`; the SHOULD PASS
quality bar is the maintainer's responsibility.

## How to run

```bash
node scripts/cross-llm-rubric.mjs \
  --context path/to/CONTEXT.md \
  --out path/to/output-dir/ \
  [--repo-summary path/to/repo-summary.md]
```

The script writes three files into `--out`:

- `report.json` — machine-readable result (status, per-criterion median,
  per-provider scores, malformed flags)
- `report.md` — human-readable table
- `raw-<provider>.txt` — raw model responses (debug)

### Required environment variables

Both must be set in `.env` at the repo root:

- `ANTHROPIC_API_KEY` — calls Opus + Sonnet
- `GEMINI_API_KEY` — calls Gemini Pro

Optional overrides:

- `ANTHROPIC_OPUS_MODEL` (default `claude-opus-4-7`)
- `ANTHROPIC_SONNET_MODEL` (default `claude-sonnet-4-6`)
- `GEMINI_MODEL` (default `gemini-2.5-pro`)

## Locked jury and threshold

| Field               | Value                                                      |
| ------------------- | ---------------------------------------------------------- |
| Jury                | `claude-opus-4-7` + `claude-sonnet-4-6` + `gemini-2.5-pro` |
| Aggregation         | Median per criterion across 3 models                       |
| PASS                | All medians ≥ 2 **AND** ≥ 80 % of criteria with median ≥ 2 |
| Greenfield criteria | Q1, Q2, Q3                                                 |
| Existing criteria   | A1-A6 + Q1-Q3 + T1-T3                                      |

## Hard-fail policy

| Condition                                       | Exit code | Behavior                                                                             |
| ----------------------------------------------- | --------- | ------------------------------------------------------------------------------------ |
| Missing `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` | 2         | Config error, no models called                                                       |
| Provider runtime error (network, 5xx, abort)    | 1         | Run aborted, no report written                                                       |
| Malformed JSON from one model                   | 0 / 1     | Run continues; that model's missing criteria score 0; report flags `malformed: true` |
| Threshold not met                               | 1         | Report written, exit FAIL                                                            |
| Threshold met                                   | 0         | Report written, exit PASS                                                            |

Rationale: the locked jury means three models, not "up to three." A
network failure on Opus makes the result non-equivalent to the locked
gate, so the run fails. A model that responds with malformed JSON is a
different failure mode: penalised in scoring, not blocking.

## Calibration note

The criteria were locked against schema v1 when only tier 0 / S were
supported. v1.27.0 (2026-05-14) added tier M / L; criterion A6
("tier plausible") may discriminate less on M / L outputs, and Q2 / Q3
do not yet reward acknowledgment of M / L feature flags. Re-calibrate
the prompt template if M / L outputs become a routine target. File as a
follow-up against the rubric memo.

## Historical: manual pilot procedure

For reference only. The v1.0 pilot (2026-05-11, results in
`docs/reviews/context-builder-pilot-v1.md`) was executed by hand: paste
the populated `prompt-template.md` into three model UIs, copy scores,
compute the median in a spreadsheet. Automation replaces this in v1.29.0.

The original manual instructions are kept here to record what the design
intended. New runs should use the automated script.
