#!/usr/bin/env node
/**
 * gen-skill-registry.mjs
 *
 * Reads SKILL.md files from all tier templates, deduplicates by skill name
 * (picks the richest tier: m > s > l > 0), and generates a skeleton
 * site/skills/<skill>.md for each unique skill.
 *
 * The generated header (metadata, tiers, flags) must not be edited manually
 * — edit the source SKILL.md instead. The "## Dove e quando" and
 * "## Output atteso" sections below the divider are hand-authored and
 * preserved across re-runs (the script never overwrites an existing file).
 *
 * Usage:
 *   node scripts/gen-skill-registry.mjs            # generate missing pages
 *   node scripts/gen-skill-registry.mjs --force    # regenerate all skeletons
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TEMPLATES_DIR = resolve(ROOT, 'packages/cli/templates');
const OUTPUT_DIR = resolve(ROOT, 'site/skills');
const FORCE = process.argv.includes('--force');

const TIER_PRIORITY = { 'm': 3, 's': 2, 'l': 1, '0': 0 };
const TIER_LABELS = { '0': 'Tier 0', 's': 'Tier S', 'm': 'Tier M', 'l': 'Tier L' };

// ── Parse SKILL.md frontmatter ──────────────────────────────────────────────

function parseFrontmatter(content) {
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

const bySkill = {}; // name → { tier, fm, path }[]

for (const tierDir of readdirSync(TEMPLATES_DIR)) {
  const skillsDir = resolve(TEMPLATES_DIR, tierDir, '.claude', 'skills');
  if (!existsSync(skillsDir)) continue;
  const tier = tierDir.replace('tier-', '');

  for (const skillDir of readdirSync(skillsDir)) {
    const skillPath = resolve(skillsDir, skillDir, 'SKILL.md');
    if (!existsSync(skillPath)) continue;
    const content = readFileSync(skillPath, 'utf8');
    const fm = parseFrontmatter(content);
    if (!fm.name) continue;

    const name = fm.name;
    if (!bySkill[name]) bySkill[name] = [];
    bySkill[name].push({ tier, fm, path: skillPath });
  }
}

// ── For each skill, pick richest tier and collect all tiers ─────────────────

const MODEL_LABELS = { haiku: 'Haiku (fast)', sonnet: 'Sonnet', opus: 'Opus (deep)' };

let generated = 0, skipped = 0;

for (const [name, entries] of Object.entries(bySkill).sort(([a], [b]) => a.localeCompare(b))) {
  // Pick richest tier for description/flags
  const best = entries.sort((a, b) => (TIER_PRIORITY[b.tier] ?? 0) - (TIER_PRIORITY[a.tier] ?? 0))[0];
  const allTiers = [...new Set(entries.map(e => e.tier))].sort((a, b) => (TIER_PRIORITY[b] ?? 0) - (TIER_PRIORITY[a] ?? 0));

  const outPath = resolve(OUTPUT_DIR, `${name}.md`);

  if (existsSync(outPath) && !FORCE) {
    skipped++;
    continue;
  }

  const { fm } = best;
  const tierBadges = allTiers.map(t => TIER_LABELS[t] || t).join(' · ');
  const model = MODEL_LABELS[fm.model] || fm.model || 'Sonnet';
  const flags = fm['argument-hint'] ? `\`${fm['argument-hint']}\`` : '—';
  const description = fm.description || '';

  const skeleton = `# /${name}

> ${description}

| Tiers | Model | Flags |
|---|---|---|
| ${tierBadges} | ${model} | ${flags} |

---

## Dove e quando

<!-- TODO: describe the specific situation that justifies invoking this skill -->

## Output atteso

<!-- TODO: describe what the skill produces, format, and a typical example -->
`;

  writeFileSync(outPath, skeleton, 'utf8');
  generated++;
  console.log(`✓ ${name}`);
}

console.log(`\nDone: ${generated} generated, ${skipped} skipped (use --force to regenerate).`);
