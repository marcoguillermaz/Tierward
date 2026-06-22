#!/usr/bin/env node
/**
 * External LLM review runner.
 *
 * Reads a prompt + a directory of context files, fans out to every provider
 * whose API key is present in .env, and writes each response to an output
 * directory. Designed for reproducible cross-model review of Tierward templates
 * (agnosticity audit Fase 3, post-cleanup validation Fase 7, future release
 * reviews).
 *
 * Usage:
 *   node scripts/external-review.mjs \
 *     --prompt docs/reviews/<name>/prompt.md \
 *     --bundle docs/reviews/<name>/bundle/ \
 *     --out    docs/reviews/<name>/responses/ \
 *     [--only openai,mistral]          # restrict to a subset of providers
 *     [--suffix chunk-a]               # append to output filenames (chunking)
 *
 * Providers are toggled by the presence of their *_API_KEY env var:
 *   OPENAI_API_KEY      → gpt-4.1
 *   GEMINI_API_KEY      → gemini-2.5-pro
 *   MISTRAL_API_KEY     → mistral-large-latest
 *   PERPLEXITY_API_KEY  → sonar-pro
 *   ANTHROPIC_API_KEY   → claude-opus-4-8    (provider name: anthropic-opus)
 *   ANTHROPIC_API_KEY   → claude-sonnet-4-6  (provider name: anthropic-sonnet)
 *
 * Override a model id per provider with e.g. OPENAI_MODEL=gpt-5,
 * ANTHROPIC_OPUS_MODEL=claude-opus-4-8, ANTHROPIC_SONNET_MODEL=claude-sonnet-4-6.
 *
 * Exit codes:
 *   0  all providers returned a response, no Critical findings
 *   1  at least one provider failed (response files for failures contain the error)
 *   2  configuration error (missing files, no providers, bad arguments)
 *   3  Critical findings detected in at least one response — resolve before closing the review
 */

import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";

// ---- arg parsing -----------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    const val = argv[i + 1];
    if (!key || val === undefined) exit(2, `bad argument near: ${argv[i]}`);
    args[key] = val;
  }
  for (const required of ["prompt", "bundle", "out"]) {
    if (!args[required]) exit(2, `missing required --${required}`);
  }
  args.only = args.only
    ? args.only
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : null;
  args.suffix = args.suffix || "";
  return args;
}

function exit(code, msg) {
  if (msg) process.stderr.write(`external-review: ${msg}\n`);
  process.exit(code);
}

// ---- .env loader (no dependency) -------------------------------------------

async function loadEnv(cwd) {
  const envPath = join(cwd, ".env");
  if (!existsSync(envPath)) return;
  const raw = await readFile(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const [, key, rawVal] = m;
    if (process.env[key]) continue; // do not override existing
    const val = rawVal.replace(/^["']|["']$/g, "");
    process.env[key] = val;
  }
}

// ---- bundle assembly -------------------------------------------------------

async function collectBundle(dir) {
  const entries = [];
  async function walk(current) {
    const items = await readdir(current, { withFileTypes: true });
    for (const it of items.sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(current, it.name);
      if (it.isDirectory()) await walk(p);
      else if (it.isFile() && it.name.endsWith(".md")) {
        const content = await readFile(p, "utf8");
        entries.push({ path: p, content });
      }
    }
  }
  await walk(dir);
  return entries;
}

function renderBundle(entries, bundleRoot) {
  // Files contain their own triple-backtick code fences, so wrapping them in
  // another fence would break parsing. Use explicit plain-text delimiters.
  const lines = ["# Context bundle", ""];
  lines.push(`Files included: ${entries.length}`, "");
  for (const e of entries) {
    const rel = e.path.startsWith(bundleRoot)
      ? e.path.slice(bundleRoot.length).replace(/^\/+/, "")
      : e.path;
    lines.push(`===== FILE-START: ${rel} =====`);
    lines.push(e.content.trimEnd());
    lines.push(`===== FILE-END: ${rel} =====`);
    lines.push("");
  }
  return lines.join("\n");
}

// ---- providers -------------------------------------------------------------

const PROVIDERS = [
  {
    name: "openai",
    envKey: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    defaultModel: "gpt-4.1",
    call: async ({ apiKey, model, system, user }) => {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: 0.2,
        }),
      });
      if (!res.ok) throw new Error(`openai ${res.status}: ${await res.text()}`);
      const j = await res.json();
      return j.choices?.[0]?.message?.content ?? "";
    },
  },
  {
    name: "gemini",
    envKey: "GEMINI_API_KEY",
    modelEnv: "GEMINI_MODEL",
    defaultModel: "gemini-2.5-pro",
    call: async ({ apiKey, model, system, user }) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { role: "system", parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: 0.2 },
        }),
      });
      if (!res.ok) throw new Error(`gemini ${res.status}: ${await res.text()}`);
      const j = await res.json();
      return (
        j.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n") ?? ""
      );
    },
  },
  {
    name: "mistral",
    envKey: "MISTRAL_API_KEY",
    modelEnv: "MISTRAL_MODEL",
    defaultModel: "mistral-large-latest",
    call: async ({ apiKey, model, system, user }) => {
      const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: 0.2,
        }),
      });
      if (!res.ok)
        throw new Error(`mistral ${res.status}: ${await res.text()}`);
      const j = await res.json();
      return j.choices?.[0]?.message?.content ?? "";
    },
  },
  {
    name: "perplexity",
    envKey: "PERPLEXITY_API_KEY",
    modelEnv: "PERPLEXITY_MODEL",
    defaultModel: "sonar-pro",
    call: async ({ apiKey, model, system, user }) => {
      const res = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: 0.2,
        }),
      });
      if (!res.ok)
        throw new Error(`perplexity ${res.status}: ${await res.text()}`);
      const j = await res.json();
      return j.choices?.[0]?.message?.content ?? "";
    },
  },
  {
    name: "anthropic-opus",
    envKey: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_OPUS_MODEL",
    defaultModel: "claude-opus-4-8",
    call: anthropicCall,
  },
  {
    name: "anthropic-sonnet",
    envKey: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_SONNET_MODEL",
    defaultModel: "claude-sonnet-4-6",
    call: anthropicCall,
  },
];

async function anthropicCall({ apiKey, model, system, user }) {
  // Note: `temperature` is omitted because Opus 4.7+ rejects it with a 400.
  // Older Anthropic models accept it but defaulting is fine for review work.
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

// ---- main ------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);
  const cwd = process.cwd();
  await loadEnv(cwd);

  const promptPath = resolve(cwd, args.prompt);
  const bundleDir = resolve(cwd, args.bundle);
  const outDir = resolve(cwd, args.out);

  if (!existsSync(promptPath)) exit(2, `prompt not found: ${promptPath}`);
  if (!existsSync(bundleDir) || !(await stat(bundleDir)).isDirectory())
    exit(2, `bundle dir not found: ${bundleDir}`);

  const system = await readFile(promptPath, "utf8");
  const bundle = await collectBundle(bundleDir);
  if (bundle.length === 0) exit(2, `bundle is empty: ${bundleDir}`);
  const userBlob = renderBundle(bundle, bundleDir);

  await mkdir(outDir, { recursive: true });

  // Preflight: classify provider availability before fanning out.
  let active = PROVIDERS.filter((p) => process.env[p.envKey]);
  const missing = PROVIDERS.filter((p) => !process.env[p.envKey]);
  if (args.only) {
    const unknown = args.only.filter(
      (n) => !PROVIDERS.some((p) => p.name === n),
    );
    if (unknown.length)
      exit(2, `unknown provider(s) in --only: ${unknown.join(",")}`);
    active = active.filter((p) => args.only.includes(p.name));
  }
  if (active.length === 0)
    exit(2, "no provider API keys found in env (after --only filter)");

  process.stdout.write(
    `Bundle: ${bundle.length} files, ${userBlob.length} chars\n`,
  );
  process.stdout.write(
    `Preflight: ${active.length}/${PROVIDERS.length} provider(s) available\n`,
  );
  process.stdout.write(`  active: ${active.map((p) => p.name).join(", ")}\n`);
  if (missing.length > 0 && !args.only) {
    process.stdout.write(
      `  missing: ${missing
        .map((p) => `${p.name} (set ${p.envKey})`)
        .join(", ")}\n`,
    );
  }
  if (active.length < PROVIDERS.length && !args.only) {
    process.stdout.write(
      "Warning: cross-LLM diversity is reduced; consider adding the missing keys for the next run.\n",
    );
  }
  process.stdout.write("\n");

  const started = Date.now();
  const results = await Promise.allSettled(
    active.map(async (p) => {
      const model = process.env[p.modelEnv] || p.defaultModel;
      const t0 = Date.now();
      process.stdout.write(`[${p.name}] calling ${model}...\n`);
      try {
        const content = await p.call({
          apiKey: process.env[p.envKey],
          model,
          system,
          user: userBlob,
        });
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        const outPath = join(
          outDir,
          `${p.name}${args.suffix ? "." + args.suffix : ""}.md`,
        );
        await writeFile(
          outPath,
          `# ${p.name} (${model}) — ${new Date().toISOString()}\n\nElapsed: ${elapsed}s\n\n---\n\n${content}\n`,
          "utf8",
        );
        process.stdout.write(`[${p.name}] OK in ${elapsed}s → ${outPath}\n`);
        return { name: p.name, ok: true, outPath };
      } catch (err) {
        const outPath = join(
          outDir,
          `${p.name}${args.suffix ? "." + args.suffix : ""}.error.md`,
        );
        await writeFile(
          outPath,
          `# ${p.name} (${model}) — ERROR — ${new Date().toISOString()}\n\n\`\`\`\n${err?.stack || err?.message || String(err)}\n\`\`\`\n`,
          "utf8",
        );
        process.stdout.write(`[${p.name}] FAIL → ${outPath}\n`);
        return { name: p.name, ok: false, outPath };
      }
    }),
  );

  const totalElapsed = ((Date.now() - started) / 1000).toFixed(1);
  process.stdout.write(`\nTotal elapsed: ${totalElapsed}s\n`);
  const failed = results.filter((r) => r.status !== "fulfilled" || !r.value.ok);
  if (failed.length > 0) {
    process.stdout.write(`Failed: ${failed.length}/${results.length}\n`);
    process.exit(1);
  }

  // Scan successful responses for Critical findings.
  // Matches **Critical**, **[Critical]**, and **[Critical] some text** (all observed model formats).
  const criticalPattern = /\*\*\[?Critical/;
  const criticalHits = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.ok) {
      const content = await readFile(r.value.outPath, "utf8");
      const hits = content
        .split("\n")
        .filter((l) => criticalPattern.test(l))
        .map((l) => l.trim());
      if (hits.length > 0) criticalHits.push({ name: r.value.name, hits });
    }
  }
  if (criticalHits.length > 0) {
    process.stdout.write("\nCritical findings detected:\n");
    for (const { name, hits } of criticalHits) {
      process.stdout.write(`\n[${name}] ${hits.length} Critical finding(s):\n`);
      for (const h of hits) process.stdout.write(`  ${h}\n`);
    }
    process.stdout.write(
      "\nResolve Critical findings before closing the review.\n",
    );
    process.exit(3);
  }
}

main().catch((err) => {
  process.stderr.write(`external-review: unhandled: ${err?.stack || err}\n`);
  process.exit(1);
});
