#!/usr/bin/env node
/**
 * Gate clause enumeration for shipped pipeline.md templates.
 *
 * Scope: make every gate visible to the maintainer. NOT logic validation —
 * that is approach E (roadmap). See docs/architecture/test-coverage-strategy.md §4.
 *
 * What is a "gate clause" here:
 *   - Heading conditional suffixes  *(if X)*, *(when Y)*, *(conditional ...)*,
 *     *(MANDATORY for ...)*, *(blocks touching ...)*.
 *   - Inline conditional gates: lines starting with "If" or "When" inside a
 *     bullet, that introduce a behavior switch.
 *   - Placeholder-keyed gates: lines that test a [PLACEHOLDER] state.
 *   - Mode gates: parenthetical "(auto-selected when ...)" markers.
 *
 * Usage:
 *   node packages/cli/test/template-coverage/gate-enum.mjs
 *   node packages/cli/test/template-coverage/gate-enum.mjs --json
 *
 * Exit code: 0 unless a parse failure occurs or a multi-phase tier produces
 * zero gates (sanity threshold — see RULES below).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const TEMPLATES = path.join(REPO_ROOT, 'packages/cli/templates');

// minGates is a sanity threshold against parser breakage or template gutting.
// Set well below current counts; raise only after intentional template additions.
const TIERS = [
  { id: 'tier-s', file: path.join(TEMPLATES, 'tier-s/.claude/rules/pipeline.md'), minGates: 0 },
  { id: 'tier-m', file: path.join(TEMPLATES, 'tier-m/.claude/rules/pipeline.md'), minGates: 8 },
  { id: 'tier-l', file: path.join(TEMPLATES, 'tier-l/.claude/rules/pipeline.md'), minGates: 12 },
];

const JSON_OUTPUT = process.argv.includes('--json');

// ── Gate matchers ───────────────────────────────────────────────────────────

const PATTERNS = [
  {
    kind: 'heading-conditional',
    re: /^(#{2,4})\s+(.+?)\s+\*\((.+?)\)\*\s*$/,
    extract: (m) => ({ heading: m[2].trim(), condition: m[3].trim() }),
  },
  {
    kind: 'mode-auto-select',
    re: /\*\*Mode\s+([AB])\s+-\s+([^*]+?)\*\*\s+\(auto-selected\s+(when[^)]+)\)/i,
    extract: (m) => ({ mode: `Mode ${m[1]}`, label: m[2].trim(), condition: m[3].trim() }),
  },
  {
    kind: 'placeholder-keyed-gate',
    re: /(If|When)\s+`\[([A-Z_]+)\]`\s+is\s+([^.:\n]+)/,
    extract: (m) => ({ placeholder: m[2], predicate: `${m[1]} ${m[3].trim()}` }),
  },
  {
    kind: 'bullet-conditional',
    re: /^\s*-\s+(?:\*\*)?(If|When|For)\s+([^:*]{3,120}):/,
    extract: (m) => ({ keyword: m[1], condition: m[2].trim() }),
  },
];

function enumerateTier(tier) {
  if (!fs.existsSync(tier.file)) {
    throw new Error(`missing pipeline.md for ${tier.id}: ${tier.file}`);
  }
  const body = fs.readFileSync(tier.file, 'utf8');
  const lines = body.split('\n');
  const gates = [];
  let currentPhase = '(preamble)';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const phaseMatch = line.match(/^##\s+(.+?)(?:\s+\*\(|\s*$)/);
    if (phaseMatch && /^(Phase|FL-)/.test(phaseMatch[1])) {
      currentPhase = phaseMatch[1].trim();
    }

    for (const pattern of PATTERNS) {
      const m = line.match(pattern.re);
      if (m) {
        gates.push({
          phase: currentPhase,
          line: i + 1,
          kind: pattern.kind,
          raw: line.trim(),
          parsed: pattern.extract(m),
        });
        break;
      }
    }
  }
  return gates;
}

function lint() {
  const result = { byTier: {}, errors: [], gateTotal: 0 };
  for (const tier of TIERS) {
    try {
      const gates = enumerateTier(tier);
      result.byTier[tier.id] = {
        gateCount: gates.length,
        minGates: tier.minGates,
        gates,
      };
      result.gateTotal += gates.length;
      if (gates.length < tier.minGates) {
        result.errors.push({
          tier: tier.id,
          detail: `enumerated ${gates.length} gates, expected at least ${tier.minGates} — parser may be broken or template has been gutted`,
        });
      }
    } catch (err) {
      result.errors.push({ tier: tier.id, detail: err.message });
    }
  }
  return result;
}

function report(result) {
  if (JSON_OUTPUT) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }
  console.log(
    `Gate clause enumeration — ${result.gateTotal} gates across ${Object.keys(result.byTier).length} tiers.\n`,
  );
  for (const [tier, data] of Object.entries(result.byTier)) {
    console.log(`── ${tier} (${data.gateCount} gates, min ${data.minGates}) ──`);
    for (const g of data.gates) {
      console.log(`  [${g.kind}] ${g.phase} :${g.line}`);
      console.log(`    ${g.raw}`);
    }
    console.log('');
  }
  if (result.errors.length > 0) {
    console.log('Errors:');
    for (const e of result.errors) {
      console.log(`  - ${e.tier}: ${e.detail}`);
    }
  }
}

const result = lint();
report(result);
process.exit(result.errors.length > 0 ? 1 : 0);
