#!/usr/bin/env node
/**
 * lint-templates.mjs — Static analysis of Tierward template files
 *
 * Catches contamination, placeholder orphans, and tier sync gaps
 * before they reach scaffolded projects.
 *
 * Usage:
 *   node scripts/lint-templates.mjs
 *   node scripts/lint-templates.mjs --fix  (future: auto-fix mode)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../packages/cli/templates');
const SCAFFOLD_SRC = path.resolve(__dirname, '../packages/cli/src/scaffold/index.js');
const CLAUDEMD_SRC = path.resolve(__dirname, '../packages/cli/src/generators/claude-md.js');

const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

let passed = 0;
let failed = 0;
let warned = 0;
const failures = [];

function pass(label) { passed++; }
function fail(label, detail = '') {
  failed++;
  const msg = detail ? `${label} — ${detail}` : label;
  failures.push(msg);
  console.log(`  ${c.red('✗')} ${msg}`);
}
function warn(label, detail = '') {
  warned++;
  const msg = detail ? `${label} — ${detail}` : label;
  console.log(`  ${c.yellow('⚠')} ${msg}`);
}

function walkFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkFiles(full));
    else results.push(full);
  }
  return results;
}

// ── Check 1: Banned patterns ────────────────────────────────────────────────

const BANNED_PATTERNS = [
  { pattern: 'staff-manager', label: 'pilot project name' },
  { pattern: 'StaffManager', label: 'pilot project class name' },
  // Literal project-specific paths (not as anchoring examples in CALIBRATION_KIT)
];

function checkBannedPatterns() {
  console.log(c.bold('\n▶ Check 1: Banned patterns'));
  const files = walkFiles(TEMPLATES_DIR);
  for (const { pattern, label } of BANNED_PATTERNS) {
    const hits = [];
    for (const f of files) {
      const ext = path.extname(f);
      if (!['.md', '.json', '.yaml', '.yml', '.js', ''].includes(ext)) continue;
      const content = fs.readFileSync(f, 'utf8');
      if (content.includes(pattern)) {
        hits.push(path.relative(TEMPLATES_DIR, f));
      }
    }
    if (hits.length === 0) {
      pass(`no "${pattern}"`);
    } else {
      fail(`"${pattern}" (${label}) found in ${hits.length} file(s)`, hits.join(', '));
    }
  }
}

// ── Check 2: Wizard placeholder coverage ────────────────────────────────────
//
// Strategy: extract the set of wizard placeholders from scaffold source code
// (.replace(/\[XXX\]/g, ...)), then verify every wizard placeholder actually
// appears in at least one template file. This catches:
//   - replace() calls referencing removed/renamed placeholders (stale code)
//   - template placeholders that should be wizard-replaced but were missed
//
// Placeholders in templates that are NOT in the wizard set are intentional —
// they are user-fillable fields (e.g. [DATE], [SCOPE]) or skill output format
// markers (e.g. [PASS], [FAIL]) and are not flagged.

function checkPlaceholderCoverage() {
  console.log(c.bold('\n▶ Check 2: Wizard placeholder coverage'));

  // Step 1: collect wizard placeholders from scaffold source code
  const sources = [SCAFFOLD_SRC, CLAUDEMD_SRC].filter(f => fs.existsSync(f));
  const wizardPlaceholders = new Set();
  const replaceRegex = /\.replace\(\s*\/\\\[([A-Z][A-Z0-9_]+)\\\]/g;

  for (const f of sources) {
    const content = fs.readFileSync(f, 'utf8');
    let m;
    while ((m = replaceRegex.exec(content)) !== null) {
      wizardPlaceholders.add(m[1]);
    }
  }

  // Step 2: collect all [UPPER_CASE] placeholders from templates
  // Include extensionless files (e.g. CODEOWNERS) via '' check
  const files = walkFiles(TEMPLATES_DIR);
  const templatePlaceholders = new Set();
  const placeholderRegex = /\[([A-Z][A-Z0-9_]+)\]/g;

  for (const f of files) {
    const ext = path.extname(f);
    if (!['.md', '.json', '.yaml', '.yml', ''].includes(ext)) continue;
    const content = fs.readFileSync(f, 'utf8');
    let m;
    while ((m = placeholderRegex.exec(content)) !== null) {
      templatePlaceholders.add(m[1]);
    }
  }

  // Step 3: every wizard placeholder should appear in at least one template.
  // Missing ones are warnings (dead code in interpolate()) not errors.
  const staleReplace = [...wizardPlaceholders].filter(p => !templatePlaceholders.has(p));
  if (staleReplace.length === 0) {
    pass('all wizard replace() targets exist in templates');
  } else {
    for (const p of staleReplace) {
      warn(`wizard replace() for [${p}] but no template contains it (dead code)`);
    }
  }

  // Step 4: flag template placeholders that LOOK like wizard placeholders
  // (match the wizard naming convention) but have no replace() call.
  // Only check placeholders that follow the wizard pattern: *_COMMAND, *_VALUE,
  // HAS_*, PROJECT_*, DESIGN_SYSTEM_*, *_LEAD, *_REVIEWER, AUDIT_MODEL, PERF_TOOL.
  const wizardPattern = /^(PROJECT_NAME|.*_COMMAND|.*_VALUE|HAS_.*|DESIGN_SYSTEM_.*|.*_LEAD|.*_REVIEWER|AUDIT_MODEL|PERF_TOOL|E2E_TOOL_NAME|TYPE_CHECK_COMMAND)$/;
  const suspectOrphans = [...templatePlaceholders].filter(
    p => wizardPattern.test(p) && !wizardPlaceholders.has(p)
  );

  if (suspectOrphans.length === 0) {
    pass('no suspect wizard-pattern placeholders without replace()');
  } else {
    for (const p of suspectOrphans) {
      fail(`[${p}] matches wizard naming pattern but has no replace() call`);
    }
  }
}

// ── Check 3: Tier M/L sync parity ──────────────────────────────────────────

function checkTierSync() {
  console.log(c.bold('\n▶ Check 3: Tier M ↔ Tier L file sync'));
  const tierM = path.join(TEMPLATES_DIR, 'tier-m');
  const tierL = path.join(TEMPLATES_DIR, 'tier-l');

  if (!fs.existsSync(tierM) || !fs.existsSync(tierL)) {
    pass('tier sync: one tier missing, skip');
    return;
  }

  const mFiles = walkFiles(tierM).map(f => path.relative(tierM, f));
  const lFiles = new Set(walkFiles(tierL).map(f => path.relative(tierL, f)));

  // Files that are intentionally tier-m-only (tier-l uses different docs structure)
  const TIER_M_ONLY = new Set([
    // tier-l docs/ has different files — these are tier-m-specific
  ]);

  // Every file in tier-m should exist in tier-l (tier-l is a superset)
  const missingInL = mFiles.filter(f => !lFiles.has(f) && !TIER_M_ONLY.has(f));
  if (missingInL.length === 0) {
    pass('tier sync: all tier-m files present in tier-l');
  } else {
    for (const f of missingInL) {
      fail(`tier sync: ${f} in tier-m but missing in tier-l`);
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

console.log(c.bold('lint-templates — Static analysis of Tierward template files'));

checkBannedPatterns();
checkPlaceholderCoverage();
checkTierSync();

console.log();
const parts = [c.green(`✓ ${passed} passed`)];
if (warned > 0) parts.push(c.yellow(`⚠ ${warned} warnings`));
parts.push(failed > 0 ? c.red(`✗ ${failed} failed`) : c.dim(`✗ ${failed} failed`));
console.log(parts.join('  '));

if (failures.length > 0) {
  console.log();
  console.log(c.bold(c.red('Failures:')));
  for (const f of failures) {
    console.log(`  ${c.red('✗')} ${f}`);
  }
}

console.log();
if (failed > 0) process.exit(1);
