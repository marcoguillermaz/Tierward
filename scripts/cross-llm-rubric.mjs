#!/usr/bin/env node
/**
 * Cross-LLM rubric — automated SHOULD PASS scoring for CONTEXT.md.
 *
 * Locked jury (memory/project_context_builder_rubric_v1.md, 2026-05-07):
 *   - claude-opus-4-8   (re-baselined 2026-06-10 from claude-opus-4-7, now superseded)
 *   - claude-sonnet-4-6
 *   - gemini-2.5-pro
 *
 * Re-baseline note (2026-06-10): the Opus seat was deliberately moved from
 * claude-opus-4-7 to claude-opus-4-8 (current Opus tier). This is intentional,
 * not stale drift. Scores produced after this date are NOT directly comparable
 * to the v1.0 pilot results scored under the 4.7 jury — treat 2026-06-10 as a
 * new scoring baseline.
 *
 * Threshold (locked 2026-05-07):
 *   - All criterion medians >= 2 AND
 *   - >= 80% of criteria with median >= 2
 *
 * Hard-fail policy (locked 2026-05-20):
 *   - Missing ANTHROPIC_API_KEY or GEMINI_API_KEY → exit 2 (config error)
 *   - Any provider runtime error (network, 5xx, timeout, abort) → exit 1
 *   - Malformed JSON response (parseable HTTP, unparseable body) is NOT a
 *     runtime error: that provider's missing-keyed criteria score 0 and a
 *     `malformed: true` flag is set in the report. The run continues.
 *
 * Exit codes:
 *   0  PASS
 *   1  FAIL (threshold not met, or provider runtime error)
 *   2  config error (missing files, missing required API keys, bad args)
 *
 * Usage:
 *   node scripts/cross-llm-rubric.mjs \
 *     --context <path/CONTEXT.md> \
 *     [--repo-summary <path>] \
 *     --out <output dir>
 *
 * Rubric calibration note: the criteria were locked against schema v1 when
 * only tier 0/S were supported. v1.27.0 (2026-05-14) added tier M/L; the
 * criterion A6 ("tier plausible") may discriminate less on M/L outputs and
 * Q2/Q3 do not yet reward acknowledgment of M/L feature flags. Re-calibrate
 * the prompt template if M/L outputs become a routine target.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve, dirname, basename } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const PROMPT_TEMPLATE_PATH = resolve(
  REPO_ROOT,
  "packages/cli/test/cross-llm-rubric/prompt-template.md",
);

export const GREENFIELD_CRITERIA = ["Q1", "Q2", "Q3"];
export const EXISTING_CRITERIA = [
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "A6",
  "Q1",
  "Q2",
  "Q3",
  "T1",
  "T2",
  "T3",
];

export const CRITERION_LABELS = {
  A1: "project.name correct",
  A2: "project.description real",
  A3: "stack.primary correct",
  A4: "commands.test runs",
  A5: "commands.dev runs",
  A6: "tier.selected plausible",
  Q1: "tier.rationale non-tautological",
  Q2: "body coherent",
  Q3: "constraints specific",
  T1: "source_files real",
  T2: "confidence reasonable",
  T3: "pending reasons specific",
};

const LOCKED_JURY = [
  {
    name: "opus",
    envKey: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_OPUS_MODEL",
    defaultModel: "claude-opus-4-8",
    call: anthropicCall,
  },
  {
    name: "sonnet",
    envKey: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_SONNET_MODEL",
    defaultModel: "claude-sonnet-4-6",
    call: anthropicCall,
  },
  {
    name: "gemini",
    envKey: "GEMINI_API_KEY",
    modelEnv: "GEMINI_MODEL",
    defaultModel: "gemini-2.5-pro",
    call: geminiCall,
  },
];

// ---- arg parsing -----------------------------------------------------------

export function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    const val = argv[i + 1];
    if (!key || val === undefined) {
      throw makeError("BAD_ARGS", `bad argument near: ${argv[i]}`);
    }
    args[key] = val;
  }
  for (const required of ["context", "out"]) {
    if (!args[required]) {
      throw makeError("BAD_ARGS", `missing required --${required}`);
    }
  }
  return args;
}

// ---- .env loader (no dependency) ------------------------------------------

async function loadEnv(cwd) {
  const envPath = join(cwd, ".env");
  if (!existsSync(envPath)) return;
  const raw = await readFile(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const [, key, rawVal] = m;
    if (process.env[key]) continue;
    process.env[key] = rawVal.replace(/^["']|["']$/g, "");
  }
}

// ---- frontmatter / mode detection -----------------------------------------

export function detectMode(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) {
    throw makeError("BAD_CONTEXT", "CONTEXT.md missing YAML frontmatter");
  }
  const modeMatch = m[1].match(/^\s*mode:\s*['"]?([a-z-]+)['"]?\s*$/m);
  if (!modeMatch) {
    throw makeError(
      "BAD_CONTEXT",
      "CONTEXT.md frontmatter missing project.mode",
    );
  }
  return modeMatch[1];
}

export function pickCriteriaForMode(mode) {
  if (mode === "greenfield") return GREENFIELD_CRITERIA.slice();
  if (mode === "in-place" || mode === "from-context") {
    return EXISTING_CRITERIA.slice();
  }
  throw makeError("BAD_CONTEXT", `unknown project.mode: ${mode}`);
}

// ---- prompt assembly -------------------------------------------------------

export function renderCriteriaList(criteria) {
  return criteria
    .map((c) => `- ${c}: ${CRITERION_LABELS[c] ?? "(no label)"}`)
    .join("\n");
}

export function fillTemplate({
  template,
  mode,
  repoSummary,
  contextMd,
  criteria,
}) {
  const criteriaList = renderCriteriaList(criteria);
  return template
    .replace(/\{MODE\}/g, mode)
    .replace(
      /\{REPO_SUMMARY\}/g,
      repoSummary || "(greenfield — no repo summary)",
    )
    .replace(/\{CONTEXT_MD_CONTENT\}/g, contextMd)
    .replace(/\{CRITERIA_LIST\}/g, criteriaList);
}

// ---- providers -------------------------------------------------------------

async function anthropicCall({ apiKey, model, system, user }) {
  // Note: `temperature` is omitted. Newer Anthropic models (Opus 4.7+)
  // reject `temperature` with a 400 `invalid_request_error`; older models
  // accept it but the rubric task is judgment-heavy and the default
  // sampling is fine. Smoke-tested 2026-05-20.
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.content?.map((b) => b.text ?? "").join("\n") ?? "";
}

async function geminiCall({ apiKey, model, system, user }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { role: "system", parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
    }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n") ?? "";
}

// ---- JSON parsing (robust) -------------------------------------------------

/**
 * Extract a scores object from a raw model response.
 *
 * Strategy:
 *   1. Try JSON.parse(raw)
 *   2. Strip ```json fences, retry
 *   3. Extract outermost {...} via greedy regex, retry
 *   4. Return null (caller sets malformed: true, scores fall back to 0)
 */
export function parseScores(raw, expectedKeys) {
  if (!raw || typeof raw !== "string") return null;
  const candidates = [];

  try {
    candidates.push(JSON.parse(raw));
  } catch {
    // ignore
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      candidates.push(JSON.parse(fenced[1]));
    } catch {
      // ignore
    }
  }

  const greedy = raw.match(/\{[\s\S]*\}/);
  if (greedy) {
    try {
      candidates.push(JSON.parse(greedy[0]));
    } catch {
      // ignore
    }
  }

  for (const c of candidates) {
    const scores = c?.scores ?? c;
    if (scores && typeof scores === "object") {
      const out = {};
      let foundAny = false;
      for (const k of expectedKeys) {
        const v = scores[k];
        const score = typeof v?.score === "number" ? v.score : Number(v);
        if (Number.isFinite(score) && score >= 0 && score <= 3) {
          out[k] = {
            score,
            comment: typeof v?.comment === "string" ? v.comment : "",
          };
          foundAny = true;
        }
      }
      if (foundAny) return out;
    }
  }

  return null;
}

// ---- aggregation -----------------------------------------------------------

export function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function aggregate({ criteria, providerResults }) {
  const perCriterion = {};
  for (const c of criteria) {
    const scores = providerResults.map((pr) => {
      const entry = pr.scores?.[c];
      return typeof entry?.score === "number" ? entry.score : 0;
    });
    perCriterion[c] = {
      label: CRITERION_LABELS[c] ?? c,
      scores: Object.fromEntries(
        providerResults.map((pr, i) => [pr.name, scores[i]]),
      ),
      median: median(scores),
    };
  }

  const medians = Object.values(perCriterion).map((c) => c.median);
  const allAboveTwo = medians.every((m) => m >= 2);
  const aboveTwoCount = medians.filter((m) => m >= 2).length;
  const percentAboveTwo =
    medians.length === 0 ? 0 : aboveTwoCount / medians.length;
  const status = allAboveTwo && percentAboveTwo >= 0.8 ? "PASS" : "FAIL";

  return {
    status,
    perCriterion,
    summary: {
      total: medians.length,
      above_two: aboveTwoCount,
      percent_above_two: Number((percentAboveTwo * 100).toFixed(1)),
      all_above_two: allAboveTwo,
    },
  };
}

// ---- report rendering ------------------------------------------------------

export function renderMarkdownReport({ aggregation, providerResults, meta }) {
  const { status, perCriterion, summary } = aggregation;
  const providerNames = providerResults.map((p) => p.name);
  const headerCols = ["Criterion", "Median", ...providerNames, "Label"];
  const rows = Object.entries(perCriterion).map(([c, data]) => [
    c,
    String(data.median),
    ...providerNames.map((n) => String(data.scores[n] ?? 0)),
    data.label,
  ]);

  const lines = [];
  lines.push(`# Cross-LLM rubric report — ${status}`);
  lines.push("");
  lines.push(`- Generated: ${meta.generatedAt}`);
  lines.push(`- Context: \`${meta.contextPath}\``);
  lines.push(`- Mode: ${meta.mode}`);
  lines.push(`- Criteria scored: ${summary.total}`);
  lines.push(
    `- Threshold: all medians >= 2 AND >= 80% of criteria with median >= 2`,
  );
  lines.push(
    `- Result: ${summary.above_two}/${summary.total} criteria with median >= 2 (${summary.percent_above_two}%)`,
  );
  lines.push("");

  const malformed = providerResults
    .filter((p) => p.malformed)
    .map((p) => p.name);
  if (malformed.length > 0) {
    lines.push(
      `> **Warning**: malformed JSON response from: ${malformed.join(", ")} — their criteria default to score 0.`,
    );
    lines.push("");
  }

  lines.push("## Scores", "");
  lines.push(`| ${headerCols.join(" | ")} |`);
  lines.push(`| ${headerCols.map(() => "---").join(" | ")} |`);
  for (const r of rows) lines.push(`| ${r.join(" | ")} |`);
  lines.push("");

  lines.push("## Per-provider models", "");
  for (const pr of providerResults) {
    lines.push(
      `- **${pr.name}** — model: \`${pr.model}\`${pr.malformed ? " (malformed response)" : ""}`,
    );
  }
  lines.push("");

  return lines.join("\n");
}

// ---- main ------------------------------------------------------------------

async function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (err) {
    return exitErr(err);
  }

  const cwd = process.cwd();
  await loadEnv(cwd);

  const contextPath = resolve(cwd, args.context);
  if (!existsSync(contextPath)) {
    return exitErr(makeError("BAD_ARGS", `context not found: ${contextPath}`));
  }
  const outDir = resolve(cwd, args.out);
  await mkdir(outDir, { recursive: true });

  const contextMd = await readFile(contextPath, "utf8");

  let mode;
  try {
    mode = detectMode(contextMd);
  } catch (err) {
    return exitErr(err);
  }
  const criteria = pickCriteriaForMode(mode);

  let repoSummary = "";
  if (args["repo-summary"]) {
    const rsPath = resolve(cwd, args["repo-summary"]);
    if (!existsSync(rsPath)) {
      return exitErr(
        makeError("BAD_ARGS", `repo-summary not found: ${rsPath}`),
      );
    }
    repoSummary = await readFile(rsPath, "utf8");
  } else if (mode !== "greenfield") {
    process.stdout.write(
      `warning: --repo-summary not provided for mode "${mode}"; scoring will be less informed.\n`,
    );
  }

  // Hard-fail config check: all three jury providers must have keys.
  const missingKeys = LOCKED_JURY.filter((p) => !process.env[p.envKey]).map(
    (p) => p.envKey,
  );
  if (missingKeys.length > 0) {
    const uniq = [...new Set(missingKeys)];
    return exitErr(
      makeError(
        "MISSING_KEYS",
        `locked jury requires ${uniq.join(" + ")}; set them in .env`,
      ),
    );
  }

  const template = await readFile(PROMPT_TEMPLATE_PATH, "utf8");
  const sysAndUser = splitSystemUser(template);
  const filledSystem = fillTemplate({
    template: sysAndUser.system,
    mode,
    repoSummary,
    contextMd,
    criteria,
  });
  const filledUser = fillTemplate({
    template: sysAndUser.user,
    mode,
    repoSummary,
    contextMd,
    criteria,
  });

  process.stdout.write(
    `Cross-LLM rubric: context=${basename(contextPath)} mode=${mode} criteria=${criteria.length}\n`,
  );
  process.stdout.write(
    `Locked jury: ${LOCKED_JURY.map((p) => p.name).join(", ")}\n\n`,
  );

  const started = Date.now();
  const settled = await Promise.allSettled(
    LOCKED_JURY.map(async (p) => {
      const model = process.env[p.modelEnv] || p.defaultModel;
      const t0 = Date.now();
      process.stdout.write(`[${p.name}] calling ${model}...\n`);
      const raw = await p.call({
        apiKey: process.env[p.envKey],
        model,
        system: filledSystem,
        user: filledUser,
      });
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      const scores = parseScores(raw, criteria);
      const malformed = scores === null;
      process.stdout.write(
        `[${p.name}] OK in ${elapsed}s${malformed ? " (malformed JSON — scoring 0)" : ""}\n`,
      );
      return {
        name: p.name,
        model,
        elapsedSeconds: Number(elapsed),
        scores: scores ?? {},
        malformed,
        raw,
      };
    }),
  );

  // Hard-fail at runtime: any rejected promise = provider error.
  const failed = settled.filter((s) => s.status === "rejected");
  if (failed.length > 0) {
    for (const f of failed) {
      process.stderr.write(
        `provider error: ${f.reason?.message ?? f.reason}\n`,
      );
    }
    process.exit(1);
  }

  const providerResults = settled.map((s) => s.value);
  const aggregation = aggregate({ criteria, providerResults });

  const meta = {
    generatedAt: new Date().toISOString(),
    contextPath,
    mode,
    elapsedSeconds: Number(((Date.now() - started) / 1000).toFixed(1)),
  };

  const reportJson = {
    schema: "cross-llm-rubric-report-v1",
    status: aggregation.status,
    meta,
    summary: aggregation.summary,
    criteria: aggregation.perCriterion,
    providers: providerResults.map((p) => ({
      name: p.name,
      model: p.model,
      elapsed_seconds: p.elapsedSeconds,
      malformed: p.malformed,
    })),
  };

  await writeFile(
    join(outDir, "report.json"),
    JSON.stringify(reportJson, null, 2),
    "utf8",
  );
  await writeFile(
    join(outDir, "report.md"),
    renderMarkdownReport({ aggregation, providerResults, meta }),
    "utf8",
  );
  for (const pr of providerResults) {
    await writeFile(
      join(outDir, `raw-${pr.name}.txt`),
      `# ${pr.name} (${pr.model})\n\n${pr.raw}\n`,
      "utf8",
    );
  }

  process.stdout.write(
    `\n${aggregation.status}: ${aggregation.summary.above_two}/${aggregation.summary.total} criteria median>=2 (${aggregation.summary.percent_above_two}%)\n`,
  );
  process.stdout.write(`Report: ${join(outDir, "report.md")}\n`);

  process.exit(aggregation.status === "PASS" ? 0 : 1);
}

function splitSystemUser(template) {
  const sys = template.match(/## SYSTEM\s*\n([\s\S]*?)(?=\n## USER)/);
  const usr = template.match(/## USER\s*\n([\s\S]*)$/);
  if (!sys || !usr) {
    throw makeError(
      "BAD_TEMPLATE",
      "prompt-template.md must contain `## SYSTEM` and `## USER` sections",
    );
  }
  return { system: sys[1].trim(), user: usr[1].trim() };
}

function makeError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function exitErr(err) {
  process.stderr.write(`cross-llm-rubric: ${err.message}\n`);
  process.exit(
    err.code === "MISSING_KEYS" ||
      err.code === "BAD_ARGS" ||
      err.code === "BAD_CONTEXT" ||
      err.code === "BAD_TEMPLATE"
      ? 2
      : 1,
  );
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`cross-llm-rubric: unhandled: ${err?.stack ?? err}\n`);
    process.exit(1);
  });
}
