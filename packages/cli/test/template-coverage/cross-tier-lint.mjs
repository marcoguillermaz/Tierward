#!/usr/bin/env node
/**
 * Cross-tier semantic lint for shipped pipeline.md templates.
 *
 * Consumes cross-tier-concepts.json (the registry) and asserts every concept
 * declared aligned-required appears in its canonical form across the tiers
 * listed in appliesTo. See docs/architecture/test-coverage-strategy.md.
 *
 * Usage:
 *   node packages/cli/test/template-coverage/cross-tier-lint.mjs
 *   node packages/cli/test/template-coverage/cross-tier-lint.mjs --json
 *
 * Exit code: 0 on no violations, 1 on any violation.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const TEMPLATES = path.join(REPO_ROOT, 'packages/cli/templates');
const REGISTRY_PATH = path.join(__dirname, 'cross-tier-concepts.json');

const TIER_FILES = {
  'tier-s': path.join(TEMPLATES, 'tier-s/.claude/rules/pipeline.md'),
  'tier-m': path.join(TEMPLATES, 'tier-m/.claude/rules/pipeline.md'),
  'tier-l': path.join(TEMPLATES, 'tier-l/.claude/rules/pipeline.md'),
};

const JSON_OUTPUT = process.argv.includes('--json');

function loadTier(tier) {
  const p = TIER_FILES[tier];
  if (!p) throw new Error(`unknown tier: ${tier}`);
  if (!fs.existsSync(p)) throw new Error(`missing pipeline.md for ${tier}: ${p}`);
  return fs.readFileSync(p, 'utf8');
}

function checkExactText(tier, body, concept) {
  if (body.includes(concept.canonicalForm)) {
    return { ok: true };
  }
  return {
    ok: false,
    detail: `canonical form not found in ${tier}/pipeline.md\nExpected (first 120 chars): ${concept.canonicalForm.slice(0, 120)}${concept.canonicalForm.length > 120 ? '…' : ''}`,
  };
}

function checkSectionPresence(tier, body, concept) {
  if (body.includes(concept.marker)) {
    return { ok: true };
  }
  return {
    ok: false,
    detail: `marker not found in ${tier}/pipeline.md: "${concept.marker}"`,
  };
}

function checkStructural(tier, body, concept) {
  const missing = concept.items.filter((item) => !body.includes(item));
  if (missing.length === 0) {
    return { ok: true };
  }
  return {
    ok: false,
    detail: `missing structural items in ${tier}/pipeline.md: ${missing.map((m) => JSON.stringify(m)).join(', ')}`,
  };
}

const CHECKERS = {
  'exact-text': checkExactText,
  'section-presence': checkSectionPresence,
  structural: checkStructural,
};

function lint() {
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  const tierBodies = {};
  for (const tier of Object.keys(TIER_FILES)) {
    tierBodies[tier] = loadTier(tier);
  }

  const violations = [];
  const checksRun = [];

  for (const concept of registry.concepts) {
    const checker = CHECKERS[concept.matchType];
    if (!checker) {
      violations.push({
        conceptId: concept.id,
        tier: null,
        detail: `unknown matchType "${concept.matchType}" in registry`,
      });
      continue;
    }
    for (const tier of concept.appliesTo) {
      if (!tierBodies[tier]) {
        violations.push({
          conceptId: concept.id,
          tier,
          detail: `concept appliesTo references unknown tier "${tier}"`,
        });
        continue;
      }
      const result = checker(tier, tierBodies[tier], concept);
      checksRun.push({ conceptId: concept.id, tier, ok: result.ok });
      if (!result.ok) {
        violations.push({
          conceptId: concept.id,
          tier,
          description: concept.description,
          detail: result.detail,
        });
      }
    }
  }

  return { violations, checksRun, conceptCount: registry.concepts.length };
}

function report(result) {
  if (JSON_OUTPUT) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }
  const total = result.checksRun.length;
  const passed = result.checksRun.filter((c) => c.ok).length;
  const failed = result.violations.length;
  console.log(`Cross-tier lint — ${result.conceptCount} concepts, ${total} checks across tiers.`);
  console.log(`  passed: ${passed}`);
  console.log(`  failed: ${failed}`);
  if (failed > 0) {
    console.log('\nViolations:');
    for (const v of result.violations) {
      console.log(`  - [${v.conceptId}] ${v.tier ?? '(registry)'}`);
      if (v.description) console.log(`      ${v.description}`);
      console.log(`      ${v.detail.split('\n').join('\n      ')}`);
    }
  }
}

const result = lint();
report(result);
process.exit(result.violations.length > 0 ? 1 : 0);
