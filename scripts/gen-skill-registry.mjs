#!/usr/bin/env node
/**
 * gen-skill-registry.mjs
 *
 * Reads SKILL.md files from all tier templates, deduplicates by skill name
 * (picks the richest tier: m > s > l > 0), and generates a skeleton
 * site/skills/<skill>.md for each unique skill.
 *
 * The generated header (title, description, tiers, model, flags) must not be
 * edited manually: edit the source SKILL.md and refresh. The "## When to use"
 * and "## Expected output" sections below the divider are hand-authored. A
 * unit test (packages/cli/test/unit/repo-scripts.test.js) checks that every
 * page's header equals what this script writes.
 *
 * Usage:
 *   node scripts/gen-skill-registry.mjs                    # generate missing pages
 *   node scripts/gen-skill-registry.mjs --refresh-headers  # rewrite the header of every page, sections kept
 *   node scripts/gen-skill-registry.mjs --force            # regenerate every page, the hand-authored sections included
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const TEMPLATES_DIR = resolve(ROOT, 'packages/cli/templates');
export const OUTPUT_DIR = resolve(ROOT, 'site/skills');

const TIER_PRIORITY = { 'm': 3, 's': 2, 'l': 1, '0': 0 };
const TIER_LABELS = { '0': 'Tier 0', 's': 'Tier S', 'm': 'Tier M', 'l': 'Tier L' };
const MODEL_LABELS = { haiku: 'Haiku (fast)', sonnet: 'Sonnet', opus: 'Opus (deep)' };

// The line that separates the generated header from the hand-authored sections.
export const DIVIDER = '\n---\n';

// ── Parse SKILL.md frontmatter ──────────────────────────────────────────────

export function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) fm[key.trim()] = rest.join(':').trim();
  }
  return fm;
}

// ── Discover all SKILL.md files ─────────────────────────────────────────────

// name → { tier, fm, path }[] for every SKILL.md under the tier templates
export function collectSkills(templatesDir = TEMPLATES_DIR) {
  const bySkill = {};
  for (const tierDir of readdirSync(templatesDir)) {
    const skillsDir = resolve(templatesDir, tierDir, '.claude', 'skills');
    if (!existsSync(skillsDir)) continue;
    const tier = tierDir.replace('tier-', '');

    for (const skillDir of readdirSync(skillsDir)) {
      const skillPath = resolve(skillsDir, skillDir, 'SKILL.md');
      if (!existsSync(skillPath)) continue;
      const fm = parseFrontmatter(readFileSync(skillPath, 'utf8'));
      if (!fm.name) continue;
      if (!bySkill[fm.name]) bySkill[fm.name] = [];
      bySkill[fm.name].push({ tier, fm, path: skillPath });
    }
  }
  return bySkill;
}

// ── Page header: title, description, tiers / model / flags table ────────────

// A GFM table cell: a `|` would end the cell, inside a code span too, so it is
// escaped (`\|`), which GFM also honours inside code spans.
export function tableCell(text) {
  return text.replace(/\|/g, '\\|');
}

// The header of a skill page, from its entries across the tiers: the richest
// tier gives the description and flags, every tier shows in the badges.
export function pageHeader(name, entries) {
  const best = [...entries].sort((a, b) => (TIER_PRIORITY[b.tier] ?? 0) - (TIER_PRIORITY[a.tier] ?? 0))[0];
  const allTiers = [...new Set(entries.map((e) => e.tier))].sort(
    (a, b) => (TIER_PRIORITY[b] ?? 0) - (TIER_PRIORITY[a] ?? 0),
  );
  const { fm } = best;
  const tierBadges = allTiers.map((t) => TIER_LABELS[t] || t).join(' · ');
  const model = MODEL_LABELS[fm.model] || fm.model || 'Sonnet';
  const flags = fm['argument-hint'] ? `\`${tableCell(fm['argument-hint'])}\`` : '—';
  const description = fm.description || '';

  return `# /${name}

> ${description}

| Tiers | Model | Flags |
|---|---|---|
| ${tierBadges} | ${model} | ${flags} |
`;
}

export function pageSkeleton(name, entries) {
  return `${pageHeader(name, entries)}${DIVIDER}
## When to use

<!-- TODO: describe the specific situation that justifies invoking this skill -->

## Expected output

<!-- TODO: describe what the skill produces, format, and a typical example -->
`;
}

// An existing page split at the divider: { header, rest }, or null when the
// page has no divider.
export function splitPage(text) {
  const at = text.indexOf(DIVIDER);
  if (at === -1) return null;
  return { header: text.slice(0, at), rest: text.slice(at) };
}

// The header every page under site/skills should start with, by file name.
export function expectedHeaders(templatesDir = TEMPLATES_DIR) {
  return Object.fromEntries(
    Object.entries(collectSkills(templatesDir)).map(([name, entries]) => [
      `${name}.md`,
      pageHeader(name, entries),
    ]),
  );
}

// ── Command line ────────────────────────────────────────────────────────────

function main() {
  const force = process.argv.includes('--force');
  const refresh = process.argv.includes('--refresh-headers');
  const bySkill = collectSkills();
  let generated = 0;
  let refreshed = 0;
  let skipped = 0;

  for (const [name, entries] of Object.entries(bySkill).sort(([a], [b]) => a.localeCompare(b))) {
    const outPath = resolve(OUTPUT_DIR, `${name}.md`);

    if (existsSync(outPath) && refresh) {
      const page = splitPage(readFileSync(outPath, 'utf8'));
      if (!page) {
        console.log(`! ${name}: no divider, header left alone`);
        skipped++;
        continue;
      }
      const header = pageHeader(name, entries);
      if (page.header === header) {
        skipped++;
        continue;
      }
      writeFileSync(outPath, header + page.rest, 'utf8');
      refreshed++;
      console.log(`↻ ${name}`);
      continue;
    }

    if (existsSync(outPath) && !force) {
      skipped++;
      continue;
    }

    writeFileSync(outPath, pageSkeleton(name, entries), 'utf8');
    generated++;
    console.log(`✓ ${name}`);
  }

  console.log(
    `\nDone: ${generated} generated, ${refreshed} headers refreshed, ${skipped} skipped` +
      (refresh ? '.' : ' (use --refresh-headers to update headers, --force to regenerate).'),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
