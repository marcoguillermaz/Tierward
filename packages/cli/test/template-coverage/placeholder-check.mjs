#!/usr/bin/env node
/**
 * Placeholder coverage check for shipped pipeline.md templates.
 *
 * For every UPPER_SNAKE_CASE placeholder `[FOO_BAR]` referenced in a tier's
 * pipeline.md body, verify it is either:
 *   (a) managed by the wizard (in WIZARD_PLACEHOLDERS), or
 *   (b) documented in the same tier's CLAUDE.md template.
 *
 * Output markers (`[SKIP]`) and user-fill identifiers (lowercase, hyphen-case,
 * guidance text like `[Italian / English / other]`) are out of scope —
 * the regex is intentionally narrow.
 *
 * Complement to assertNoUnfilledWizardPlaceholders in run.js, which operates on
 * post-wizard scaffolded output. This check operates on the template source
 * before any scaffold runs. See docs/architecture/test-coverage-strategy.md §4.
 *
 * Usage:
 *   node packages/cli/test/template-coverage/placeholder-check.mjs
 *   node packages/cli/test/template-coverage/placeholder-check.mjs --json
 *
 * Exit code: 0 on full coverage, 1 if any placeholder is undocumented.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const TEMPLATES = path.join(REPO_ROOT, 'packages/cli/templates');

// Kept in sync manually with packages/cli/test/integration/run.js WIZARD_PLACEHOLDERS.
// Any addition there must be mirrored here.
const WIZARD_PLACEHOLDERS = new Set([
  'PROJECT_NAME',
  'TECH_STACK_SUMMARY',
  'TEST_COMMAND',
  'TYPE_CHECK_COMMAND',
  'BUILD_COMMAND',
  'DEV_COMMAND',
  'INSTALL_COMMAND',
  'TECH_LEAD',
  'BACKEND_LEAD',
  'SECURITY_REVIEWER',
  'E2E_COMMAND',
  'AUDIT_MODEL',
  'DESIGN_SYSTEM_NAME',
  'FRAMEWORK_VALUE',
  'LANGUAGE_VALUE',
  'API_TESTS_PATH',
  'MIGRATION_COMMAND',
  'PERF_TOOL',
  'PROFILER_COMMAND',
  'LINT_COMMAND',
  'SECURITY_CHECKLIST_ITEMS',
]);

// Output markers and other non-placeholder uppercase tokens that may appear in
// brackets but are not intended as configurable values.
const NON_PLACEHOLDER_TOKENS = new Set(['SKIP']);

const TIERS = [
  {
    id: 'tier-s',
    pipeline: path.join(TEMPLATES, 'tier-s/.claude/rules/pipeline.md'),
    claudeMd: path.join(TEMPLATES, 'tier-s/CLAUDE.md'),
  },
  {
    id: 'tier-m',
    pipeline: path.join(TEMPLATES, 'tier-m/.claude/rules/pipeline.md'),
    claudeMd: path.join(TEMPLATES, 'tier-m/CLAUDE.md'),
  },
  {
    id: 'tier-l',
    pipeline: path.join(TEMPLATES, 'tier-l/.claude/rules/pipeline.md'),
    claudeMd: path.join(TEMPLATES, 'tier-l/CLAUDE.md'),
  },
];

const JSON_OUTPUT = process.argv.includes('--json');
const PLACEHOLDER_RE = /\[([A-Z][A-Z0-9_]{2,})\]/g;

function extractPlaceholders(body) {
  const set = new Set();
  let m;
  PLACEHOLDER_RE.lastIndex = 0;
  while ((m = PLACEHOLDER_RE.exec(body)) !== null) {
    if (!NON_PLACEHOLDER_TOKENS.has(m[1])) {
      set.add(m[1]);
    }
  }
  return [...set].sort();
}

function check() {
  const result = { byTier: {}, missing: [] };
  for (const tier of TIERS) {
    if (!fs.existsSync(tier.pipeline) || !fs.existsSync(tier.claudeMd)) {
      result.missing.push({
        tier: tier.id,
        placeholder: '(file)',
        detail: `missing pipeline.md or CLAUDE.md for ${tier.id}`,
      });
      continue;
    }
    const pipelineBody = fs.readFileSync(tier.pipeline, 'utf8');
    const claudeBody = fs.readFileSync(tier.claudeMd, 'utf8');
    const placeholders = extractPlaceholders(pipelineBody);

    const verdict = [];
    for (const ph of placeholders) {
      const inWizard = WIZARD_PLACEHOLDERS.has(ph);
      const inClaudeMd = claudeBody.includes(`[${ph}]`);
      const status = inWizard
        ? 'wizard-managed'
        : inClaudeMd
          ? 'documented-in-claude-md'
          : 'undocumented';
      verdict.push({ placeholder: ph, status, inWizard, inClaudeMd });
      if (status === 'undocumented') {
        result.missing.push({
          tier: tier.id,
          placeholder: ph,
          detail: `placeholder [${ph}] referenced in ${tier.id}/pipeline.md is neither wizard-managed nor documented in ${tier.id}/CLAUDE.md`,
        });
      }
    }
    result.byTier[tier.id] = { placeholderCount: placeholders.length, verdict };
  }
  return result;
}

function report(result) {
  if (JSON_OUTPUT) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }
  let total = 0;
  for (const data of Object.values(result.byTier)) total += data.placeholderCount;
  console.log(`Placeholder coverage — ${total} uppercase placeholders referenced across tiers.\n`);
  for (const [tier, data] of Object.entries(result.byTier)) {
    console.log(`── ${tier} (${data.placeholderCount} placeholders) ──`);
    for (const v of data.verdict) {
      const marker = v.status === 'undocumented' ? '✗' : '✓';
      console.log(`  ${marker} [${v.placeholder}] — ${v.status}`);
    }
    console.log('');
  }
  if (result.missing.length > 0) {
    console.log(`Undocumented placeholders: ${result.missing.length}`);
    for (const m of result.missing) {
      console.log(`  - ${m.tier}: [${m.placeholder}]`);
      console.log(`      ${m.detail}`);
    }
  }
}

const result = check();
report(result);
process.exit(result.missing.length > 0 ? 1 : 0);
