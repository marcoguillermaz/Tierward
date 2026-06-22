// Anthropic drift tracker — scans Anthropic docs for features overlapping with Tierward.
// Zero external dependencies. Runs on Node.js >= 22 (native fetch).

import { readFileSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const REGEX_META = /[.*+?^${}()|[\]\\]/;

// ── Feature manifest ────────────────────────────────────────────────────────

export function loadFeatures(manifestPath) {
  const p = manifestPath || join(__dirname, "features.json");
  const raw = JSON.parse(readFileSync(p, "utf8"));

  if (!raw.features || !Array.isArray(raw.features)) {
    throw new Error('features.json must contain a "features" array');
  }

  const ids = new Set();
  for (const f of raw.features) {
    if (!f.id || !f.name || !f.risk || !f.keywords || !f.tierwardFiles) {
      throw new Error(
        `Feature "${f.id || "(unnamed)"}" missing required fields`,
      );
    }
    if (!["high", "medium", "low"].includes(f.risk)) {
      throw new Error(`Feature "${f.id}" has invalid risk: ${f.risk}`);
    }
    if (ids.has(f.id)) {
      throw new Error(`Duplicate feature ID: ${f.id}`);
    }
    ids.add(f.id);
  }

  return raw;
}

// ── HTML processing ─────────────────────────────────────────────────────────

export async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "tierward-drift-tracker/1.0" },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText} for ${url}`);
  }
  return res.text();
}

export function stripHtml(html) {
  if (!html) return "";
  let text = html;
  // Remove script/style blocks (closing tag may contain whitespace or attributes)
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script[^>]*>/gi, " ");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style[^>]*>/gi, " ");
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, " ");
  // Decode entities — &amp; must be decoded LAST to avoid double-unescaping
  text = text.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&amp;/g, "&");
  // Normalize whitespace
  text = text.replace(/\s+/g, " ");
  return text.trim();
}

export function extractRecentChangelog(html, days = 7, now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);

  const entries = [];
  const blockRegex =
    /<Update\s+label="([^"]+)"\s+description="([^"]+)">([\s\S]*?)<\/Update>/gi;
  let match;

  while ((match = blockRegex.exec(html)) !== null) {
    const version = match[1];
    const dateStr = match[2];
    const body = match[3];
    const entryDate = new Date(dateStr);

    if (isNaN(entryDate.getTime())) continue;
    if (entryDate < cutoff) continue;

    entries.push({
      version,
      date: dateStr,
      text: stripHtml(body),
    });
  }

  return entries;
}

// ── URL helpers ─────────────────────────────────────────────────────────────

export function getISOWeek(date) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

export function currentWhatsNewUrl(now = new Date()) {
  const week = getISOWeek(now);
  const year = now.getFullYear();
  return `https://docs.anthropic.com/en/docs/claude-code/whats-new/${year}-w${String(week).padStart(2, "0")}`;
}

// ── Keyword matching ────────────────────────────────────────────────────────

export function extractSnippet(text, position, radius = 100) {
  const start = Math.max(0, position - radius);
  const end = Math.min(text.length, position + radius);
  let snippet = text.slice(start, end).trim();
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";
  return snippet;
}

export function matchFeature(feature, text) {
  const lowerText = text.toLowerCase();
  const matchedKeywords = [];
  const snippets = [];
  const mode = feature.keywordMode || "any";

  for (const kw of feature.keywords) {
    let found = false;
    let pos = -1;

    if (REGEX_META.test(kw)) {
      try {
        const re = new RegExp(kw, "i");
        const m = re.exec(text);
        if (m) {
          found = true;
          pos = m.index;
        }
      } catch {
        // Invalid regex — skip
      }
    } else {
      const idx = lowerText.indexOf(kw.toLowerCase());
      if (idx !== -1) {
        found = true;
        pos = idx;
      }
    }

    if (found) {
      matchedKeywords.push(kw);
      if (pos >= 0) {
        snippets.push(extractSnippet(text, pos));
      }
    }
  }

  const matched =
    mode === "all"
      ? matchedKeywords.length === feature.keywords.length
      : matchedKeywords.length > 0;

  return { matched, matchedKeywords, snippets };
}

// ── Issue formatting ────────────────────────────────────────────────────────

export function formatIssueBody(matchResult, feature, scanMeta) {
  const lines = [];
  lines.push(`## Anthropic Drift Alert: ${feature.name}`);
  lines.push("");
  lines.push(`**Risk level**: ${feature.risk.toUpperCase()}`);
  lines.push(`**Scan date**: ${scanMeta.scanDate}`);
  lines.push(`**Source**: ${scanMeta.changelogUrl}`);
  lines.push("");
  lines.push("### What was detected");
  lines.push("");
  lines.push("Keywords matched in Anthropic documentation:");
  lines.push("");
  lines.push("| Keyword | Context |");
  lines.push("|---|---|");
  for (let i = 0; i < matchResult.matchedKeywords.length; i++) {
    const kw = matchResult.matchedKeywords[i];
    const ctx = (matchResult.snippets[i] || "")
      .replace(/\\/g, "\\\\")
      .replace(/\|/g, "\\|")
      .replace(/\n/g, " ");
    lines.push(`| \`${kw}\` | ${ctx} |`);
  }

  if (feature.tierwardFiles.length > 0) {
    lines.push("");
    lines.push("### Tierward files at risk");
    lines.push("");
    for (const f of feature.tierwardFiles) {
      lines.push(`- \`${f}\``);
    }
  }

  lines.push("");
  lines.push("### Recommended action");
  lines.push("");
  lines.push(
    "Review the Anthropic documentation and assess whether Tierward's implementation still adds value beyond the native capability.",
  );
  lines.push("");
  lines.push(`- [Changelog](${scanMeta.changelogUrl})`);

  if (feature.notes) {
    lines.push("");
    lines.push("### Context");
    lines.push("");
    lines.push(feature.notes);
  }

  lines.push("");
  lines.push("---");
  lines.push(`_Generated by drift-tracker workflow. ${scanMeta.scanDate}_`);

  return lines.join("\n");
}

// ── Scan orchestrator ───────────────────────────────────────────────────────

export async function scan(manifest, options = {}) {
  const { dryRun = false, days = 7 } = options;
  const features = manifest.features;
  const changelogUrl = manifest.sourceUrls.changelog;

  const result = {
    matches: [],
    scanDate: new Date().toISOString().split("T")[0],
    changelogUrl,
    featuresChecked: features.length,
  };

  // Fetch changelog
  let changelogText = "";
  try {
    const html = await fetchPage(changelogUrl);
    const entries = extractRecentChangelog(html, days);
    changelogText = entries
      .map((e) => `${e.version} ${e.date} ${e.text}`)
      .join(" ");

    if (changelogText.length < 50 && entries.length === 0) {
      // Fallback: use full page text (no Update blocks found — page format may have changed)
      changelogText = stripHtml(html);
    }

    if (changelogText.length < 500) {
      console.warn(
        `Warning: changelog text is short (${changelogText.length} chars) — page may be SPA-rendered or empty`,
      );
    }
  } catch (err) {
    console.error(`Failed to fetch changelog: ${err.message}`);
    if (!dryRun) process.exitCode = 1;
    return result;
  }

  // Match features
  for (const feature of features) {
    const matchResult = matchFeature(feature, changelogText);
    if (matchResult.matched) {
      const issueBody = formatIssueBody(matchResult, feature, result);
      result.matches.push({
        featureId: feature.id,
        featureName: feature.name,
        risk: feature.risk,
        matchedKeywords: matchResult.matchedKeywords,
        snippets: matchResult.snippets,
        issueBody,
      });
    }
  }

  return result;
}

// ── CLI entry point ─────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run") || process.env.DRY_RUN === "true";
  const daysArg = args.find((a) => a.startsWith("--days="));
  const days = daysArg ? Number(daysArg.split("=")[1]) : 7;
  const featuresArg = args.find((a) => a.startsWith("--features="));
  const featuresPath = featuresArg ? featuresArg.split("=")[1] : undefined;

  const manifest = loadFeatures(featuresPath);
  console.log(
    `Scanning ${manifest.features.length} features (lookback: ${days} days, dry-run: ${dryRun})`,
  );

  const result = await scan(manifest, { dryRun, days });

  console.log(
    `Found ${result.matches.length} matches out of ${result.featuresChecked} features checked`,
  );

  if (dryRun) {
    if (result.matches.length === 0) {
      console.log("No drift detected.");
    } else {
      for (const m of result.matches) {
        console.log(`\n--- [${m.risk.toUpperCase()}] ${m.featureName} ---`);
        console.log(`Keywords: ${m.matchedKeywords.join(", ")}`);
        for (const s of m.snippets) {
          console.log(`  > ${s.slice(0, 120)}`);
        }
      }
    }
    return;
  }

  // Write to GITHUB_OUTPUT for workflow consumption
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    appendFileSync(outputFile, `match_count=${result.matches.length}\n`);
    appendFileSync(outputFile, `features_checked=${result.featuresChecked}\n`);
    // Use heredoc for JSON to avoid shell escaping issues
    const json = JSON.stringify(result.matches);
    appendFileSync(outputFile, `matches_json<<DRIFT_EOF\n${json}\nDRIFT_EOF\n`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

// Run if executed directly
const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url).endsWith(process.argv[1].replace(/.*\//, ""));
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
