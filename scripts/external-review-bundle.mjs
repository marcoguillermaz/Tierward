#!/usr/bin/env node
/**
 * Auto-assembles a reproducible bundle of CDK files for external LLM review.
 *
 * Output bundle (default):
 *   - README.md
 *   - CHANGELOG.md (last 3 release entries)
 *   - packages/cli/templates/tier-m/.claude/skills/security-audit/SKILL.md
 *   - packages/cli/templates/tier-m/.claude/rules/pipeline.md
 *   - .claude/initiatives/roadmap-status.md
 *
 * Usage:
 *   node scripts/external-review-bundle.mjs --out docs/reviews/2026-04-26-quick/bundle/
 *
 * Each file lands at <out>/<basename> with the original name preserved.
 * CHANGELOG is sliced to the last 3 entries to keep the bundle compact and
 * avoid models budgeting their attention on early-release noise.
 *
 * Exit codes:
 *   0  bundle assembled
 *   1  one or more sources missing
 *   2  bad arguments
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const SOURCES = [
  { src: "README.md", dest: "README.md", transform: null },
  { src: "CHANGELOG.md", dest: "CHANGELOG.md", transform: lastThreeReleases },
  {
    src: "packages/cli/templates/tier-m/.claude/skills/security-audit/SKILL.md",
    dest: "security-audit-SKILL.md",
    transform: null,
  },
  {
    src: "packages/cli/templates/tier-m/.claude/rules/pipeline.md",
    dest: "pipeline-tier-m.md",
    transform: null,
  },
  {
    src: ".claude/initiatives/roadmap-status.md",
    dest: "roadmap-status.md",
    transform: null,
  },
];

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") args.out = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error(`Unknown arg: ${a}`);
  }
  return args;
}

function lastThreeReleases(content) {
  const lines = content.split("\n");
  const releaseHeaders = [];
  lines.forEach((line, i) => {
    if (/^## \[\d+\.\d+\.\d+\]/.test(line)) releaseHeaders.push(i);
  });
  if (releaseHeaders.length === 0) return content;
  const startLine = releaseHeaders[0];
  const endLine = releaseHeaders.length >= 4 ? releaseHeaders[3] : lines.length;
  const head = lines.slice(0, startLine);
  const slice = lines.slice(startLine, endLine);
  return [
    ...head,
    "> Bundle note: trimmed to the last three releases for review compactness.",
    "",
    ...slice,
  ].join("\n");
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (err) {
    console.error(`Argument error: ${err.message}`);
    process.exit(2);
  }

  if (args.help || !args.out) {
    console.log("Usage: node scripts/external-review-bundle.mjs --out <dir>");
    process.exit(args.help ? 0 : 2);
  }

  const outDir = resolve(args.out);
  await mkdir(outDir, { recursive: true });

  const missing = [];
  for (const entry of SOURCES) {
    const srcPath = resolve(REPO_ROOT, entry.src);
    if (!existsSync(srcPath)) {
      missing.push(entry.src);
      continue;
    }
    const raw = await readFile(srcPath, "utf8");
    const content = entry.transform ? entry.transform(raw) : raw;
    const destPath = join(outDir, entry.dest);
    await writeFile(destPath, content);
    const lines = content.split("\n").length;
    console.log(`  ✓ ${entry.dest} (${lines} lines)`);
  }

  if (missing.length > 0) {
    console.error(
      `\nMissing sources:\n${missing.map((m) => `  - ${m}`).join("\n")}`,
    );
    process.exit(1);
  }

  console.log(`\nBundle assembled at ${args.out}`);
  console.log(`Files: ${SOURCES.length}`);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
