/**
 * claude-dev-kit - Integration test suite
 *
 * Tests the scaffold layer directly (bypasses Inquirer).
 * Validates file structure, placeholder resolution, and Stop hook presence
 * across all tier/mode combinations.
 *
 * Usage:
 *   node packages/cli/test/integration/run.js
 *   node packages/cli/test/integration/run.js --verbose
 *
 * Output dir: packages/cli/test/integration/output/  (gitignored)
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { scaffoldTier, scaffoldTierSafe } from '../../src/scaffold/index.js';
import { generateClaudeMd } from '../../src/generators/claude-md.js';
import { generateReadme } from '../../src/generators/readme.js';
import {
  parseSkillFile,
  countBodyLines,
  allowedToolsHasCommas,
} from '../../src/utils/skill-frontmatter.js';
import { SKILL_MD_MAX_LINES } from '../../src/utils/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');
const OUTPUT_DIR = path.resolve(__dirname, 'output');
const VERBOSE = process.argv.includes('--verbose');

// ── Colours (no dependency on chalk to keep the script standalone) ──────────

const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

// ── Test state ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let warned = 0;
const failures = [];

function pass(label) {
  passed++;
  if (VERBOSE) console.log(`  ${c.green('✓')} ${c.dim(label)}`);
}

function fail(label, detail = '') {
  failed++;
  const msg = detail ? `${label} - ${detail}` : label;
  failures.push(msg);
  console.log(`  ${c.red('✗')} ${label}${detail ? c.dim(' - ' + detail) : ''}`);
}

function warn(label, detail = '') {
  warned++;
  if (VERBOSE) console.log(`  ${c.yellow('⚠')} ${label}${detail ? c.dim(' - ' + detail) : ''}`);
}

// ── Assertions ───────────────────────────────────────────────────────────────

/** Assert file content contains a substring */
function assertContains(dir, relPath, substring, label) {
  const full = path.join(dir, relPath);
  if (!fs.existsSync(full)) {
    fail(`${label || relPath} - file missing`);
    return;
  }
  const content = fs.readFileSync(full, 'utf8');
  if (content.includes(substring)) {
    pass(label || `${relPath} contains "${substring.slice(0, 40)}"`);
  } else {
    fail(
      label || `${relPath} should contain "${substring.slice(0, 60)}"`,
      `not found in ${relPath}`,
    );
  }
}

/** Assert file content does NOT contain a substring */
function assertNotContains(dir, relPath, substring, label) {
  const full = path.join(dir, relPath);
  if (!fs.existsSync(full)) {
    pass(label || `${relPath} absent (OK)`);
    return;
  }
  const content = fs.readFileSync(full, 'utf8');
  if (!content.includes(substring)) {
    pass(label || `${relPath} free of "${substring.slice(0, 40)}"`);
  } else {
    fail(
      label || `${relPath} should NOT contain "${substring.slice(0, 60)}"`,
      `found in ${relPath}`,
    );
  }
}

/** Assert no file in scaffold contains a banned pattern */
function assertNoBannedPattern(dir, pattern, label) {
  const files = walkFiles(dir);
  const hits = [];
  for (const f of files) {
    const ext = path.extname(f);
    if (!['.md', '.json', '.yaml', '.yml', ''].includes(ext)) continue;
    const content = fs.readFileSync(f, 'utf8');
    if (content.includes(pattern)) {
      hits.push(path.relative(dir, f));
    }
  }
  if (hits.length === 0) {
    pass(label || `no "${pattern.slice(0, 30)}" in any file`);
  } else {
    fail(label || `"${pattern.slice(0, 30)}" found in ${hits.length} file(s)`, hits.join(', '));
  }
}

/** Get skill names from cheatsheet.md "Audit skills" table */
function getCheatsheetSkillNames(dir) {
  const f = path.join(dir, '.claude', 'cheatsheet.md');
  if (!fs.existsSync(f)) return [];
  const content = fs.readFileSync(f, 'utf8');
  const auditMatch = content.match(/## Audit skills\n([\s\S]*?)(?=\n## |\n$|$)/);
  if (!auditMatch) return [];
  return [...auditMatch[1].matchAll(/^\| `\/([\w-]+)`/gm)].map((m) => m[1]);
}

/** Assert every cheatsheet skill row has a corresponding skill directory */
function assertCheatsheetSkillsHaveDirs(dir, prefix) {
  const cheatSkills = getCheatsheetSkillNames(dir);
  const skillsDir = path.join(dir, '.claude', 'skills');
  const existingDirs = fs.existsSync(skillsDir)
    ? fs
        .readdirSync(skillsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
    : [];
  const existingSet = new Set(existingDirs);

  let orphans = 0;
  for (const skill of cheatSkills) {
    if (existingSet.has(skill)) {
      pass(`${prefix}: cheatsheet /${skill} has dir`);
    } else {
      fail(`${prefix}: cheatsheet lists /${skill} but no skill dir exists`);
      orphans++;
    }
  }
  if (orphans === 0 && cheatSkills.length > 0) {
    pass(`${prefix}: all ${cheatSkills.length} cheatsheet skills have dirs`);
  }
}

function assertExists(dir, relPath) {
  const full = path.join(dir, relPath);
  if (fs.existsSync(full)) {
    pass(`exists: ${relPath}`);
  } else {
    fail(`missing: ${relPath}`);
  }
}

function assertNotExists(dir, relPath) {
  const full = path.join(dir, relPath);
  if (!fs.existsSync(full)) {
    pass(`absent: ${relPath}`);
  } else {
    fail(`should be absent: ${relPath}`);
  }
}

// Placeholders the wizard MUST resolve. Any of these left unfilled = real bug.
const WIZARD_PLACEHOLDERS = [
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
];
// All other placeholders (skill config, ADR template, state machines, etc.)
// are intentionally left for the user/Claude to fill in at first session.

function assertNoUnfilledWizardPlaceholders(dir) {
  const allFiles = walkFiles(dir);
  const hits = [];

  for (const f of allFiles) {
    // CONTEXT_IMPORT.md intentionally references these patterns as instructions
    // for Claude to fill in pipeline.md - not actual unfilled wizard placeholders
    if (path.basename(f) === 'CONTEXT_IMPORT.md') continue;

    // doc-audit's SKILL.md and PATTERNS.md enumerate the CDK placeholder tokens
    // verbatim as part of the audit specification (D3 check). Not unfilled.
    const rel = path.relative(dir, f);
    if (rel.includes(path.join('skills', 'doc-audit'))) continue;

    const ext = path.extname(f);
    if (!['.md', '.json', '.yaml', '.yml', ''].includes(ext)) continue;
    const content = fs.readFileSync(f, 'utf8');
    const found = WIZARD_PLACEHOLDERS.filter((p) => content.includes(`[${p}]`));
    if (found.length > 0) {
      hits.push({ file: path.relative(dir, f), placeholders: found.map((p) => `[${p}]`) });
    }
  }

  if (hits.length === 0) {
    pass('wizard placeholders all resolved');
  } else {
    for (const h of hits) {
      fail(`wizard placeholder not resolved in ${h.file}`, h.placeholders.join(', '));
    }
  }
}

function assertStopHookPresent(dir) {
  const settingsPath = path.join(dir, '.claude', 'settings.json');
  if (!fs.existsSync(settingsPath)) {
    fail('Stop hook check - .claude/settings.json missing');
    return;
  }
  const raw = fs.readFileSync(settingsPath, 'utf8');
  if (raw.includes('"Stop"')) {
    pass('Stop hook present in settings.json');
  } else {
    fail('Stop hook missing from settings.json');
  }
}

function assertStopHookResolved(dir) {
  const settingsPath = path.join(dir, '.claude', 'settings.json');
  if (!fs.existsSync(settingsPath)) return;
  const raw = fs.readFileSync(settingsPath, 'utf8');
  if (raw.includes('[TEST_COMMAND]')) {
    fail('Stop hook contains unfilled [TEST_COMMAND] placeholder');
  } else {
    pass('Stop hook [TEST_COMMAND] resolved');
  }
}

function assertFileUnchanged(dir, relPath, originalContent) {
  const full = path.join(dir, relPath);
  if (!fs.existsSync(full)) {
    fail(`safe-mode: file disappeared: ${relPath}`);
    return;
  }
  const current = fs.readFileSync(full, 'utf8');
  if (current === originalContent) {
    pass(`safe-mode: existing file preserved: ${relPath}`);
  } else {
    fail(`safe-mode: existing file was overwritten: ${relPath}`);
  }
}

function assertDirExists(dir, relPath) {
  const full = path.join(dir, relPath);
  if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
    pass(`dir exists: ${relPath}`);
  } else {
    fail(`missing dir: ${relPath}`);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function walkFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

async function scaffold(scenarioName, tier, config, safe = false) {
  const dir = path.join(OUTPUT_DIR, scenarioName);
  await fs.ensureDir(dir);
  const fn = safe ? scaffoldTierSafe : scaffoldTier;
  await fn(tier, dir, config, TEMPLATES_DIR);
  await generateClaudeMd(config, dir);
  if (!config.isDiscovery) await generateReadme(config, dir);
  return dir;
}

function section(title) {
  console.log();
  console.log(c.bold(c.cyan(`▶ ${title}`)));
}

// ── Base configs ─────────────────────────────────────────────────────────────

const BASE = {
  projectName: 'Test Project',
  description: 'Integration test scaffold',
  techStack: 'node-ts',
  testCommand: 'npx vitest run',
  typeCheckCommand: 'npx tsc --noEmit',
  devCommand: 'npm run dev',
  buildCommand: 'npm run build',
  installCommand: 'npm install',
  e2eCommand: '',
  includePreCommit: true,
  includeGithub: true,
  techLead: 'tech-lead',
  backendLead: 'backend-lead',
  securityReviewer: 'security-reviewer',
  mode: 'greenfield',
  // Feature flags (default: all enabled - full install)
  hasApi: true,
  hasDatabase: true,
  hasFrontend: true,
  hasDesignSystem: true,
  designSystemName: 'Test UI',
  auditModel: 'claude-sonnet-4-6',
  hasPrd: false,
  hasE2E: false,
};

// ── Scenarios ────────────────────────────────────────────────────────────────

async function scenarioTier0() {
  section('Tier 0 - Discovery');
  const config = {
    ...BASE,
    tier: '0',
    isDiscovery: true,
    includePreCommit: false,
    includeGithub: false,
  };
  const dir = await scaffold('tier-0', '0', config);

  assertExists(dir, 'CLAUDE.md');
  assertExists(dir, 'GETTING_STARTED.md');
  assertExists(dir, '.claude/settings.json');
  assertDirExists(dir, '.claude/session');

  // Tier 0 must NOT have pipeline or governance files
  assertNotExists(dir, '.claude/rules/pipeline.md');
  assertNotExists(dir, 'README.md');
  assertNotExists(dir, '.github');
  assertNotExists(dir, '.pre-commit-config.yaml');

  assertStopHookPresent(dir);
  assertStopHookResolved(dir);
  assertNoUnfilledWizardPlaceholders(dir);
}

async function scenarioTierS_full() {
  section('Tier S - Greenfield (full: precommit + github)');
  const config = { ...BASE, tier: 's', isDiscovery: false };
  const dir = await scaffold('tier-s-full', 's', config);

  // Core files
  assertExists(dir, 'CLAUDE.md');
  assertExists(dir, 'README.md');
  assertExists(dir, '.claude/settings.json');
  assertDirExists(dir, '.claude/session');

  // Rules
  assertExists(dir, '.claude/rules/pipeline.md');
  assertExists(dir, '.claude/rules/context-review.md');
  assertExists(dir, '.claude/rules/git.md');
  assertExists(dir, '.claude/rules/security.md');

  // Skills (Tier S: arch-audit, commit, simplify, skill-dev, perf-audit, security-audit)
  assertExists(dir, '.claude/skills/arch-audit/SKILL.md');
  assertExists(dir, '.claude/skills/commit/SKILL.md');
  assertExists(dir, '.claude/skills/simplify/SKILL.md');
  assertExists(dir, '.claude/skills/skill-dev/SKILL.md');
  assertExists(dir, '.claude/skills/perf-audit/SKILL.md');
  assertExists(dir, '.claude/skills/security-audit/SKILL.md');
  assertNotExists(dir, '.claude/agents');

  // Tier S must NOT have M/L-only skills
  assertNotExists(dir, '.claude/skills/api-design/SKILL.md');
  assertNotExists(dir, '.claude/skills/skill-db/SKILL.md');
  assertNotExists(dir, '.claude/skills/migration-audit/SKILL.md');
  assertNotExists(dir, '.claude/skills/responsive-audit/SKILL.md');
  assertNotExists(dir, '.claude/skills/accessibility-audit/SKILL.md');
  assertNotExists(dir, '.claude/skills/test-audit/SKILL.md');

  // Active Skills section in CLAUDE.md
  const claudeS = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
  if (claudeS.includes('## Active Skills')) {
    pass('Tier S: Active Skills section present in CLAUDE.md');
  } else {
    fail('Tier S: Active Skills section missing from CLAUDE.md');
  }
  if (
    claudeS.includes('/skill-dev') &&
    claudeS.includes('/perf-audit') &&
    claudeS.includes('/security-audit') &&
    claudeS.includes('/simplify')
  ) {
    pass('Tier S: Active Skills lists promoted skills');
  } else {
    fail('Tier S: Active Skills missing promoted skills');
  }
  if (!claudeS.includes('/api-design') && !claudeS.includes('/skill-db')) {
    pass('Tier S: Active Skills does not list M/L-only skills');
  } else {
    fail('Tier S: Active Skills incorrectly lists M/L-only skills');
  }

  // Optional inclusions
  assertExists(dir, '.github/PULL_REQUEST_TEMPLATE.md');
  assertExists(dir, '.github/CODEOWNERS');
  assertExists(dir, '.pre-commit-config.yaml');

  // Tier S skips informational docs (P2 - reduce file count)
  assertNotExists(dir, '.claude/files-guide.md');
  assertNotExists(dir, 'docs/adr/template.md');
  assertNotExists(dir, 'docs/pipeline-standards.md');
  assertNotExists(dir, 'docs/claudemd-standards.md');

  // Tier S must NOT have M/L-only files
  assertNotExists(dir, '.claude/FIRST_SESSION.md');
  assertNotExists(dir, 'MEMORY.md');
  assertNotExists(dir, 'docs/sitemap.md');
  assertNotExists(dir, 'docs/db-map.md');

  assertStopHookPresent(dir);
  assertStopHookResolved(dir);
  assertNoUnfilledWizardPlaceholders(dir);
}

async function scenarioTierS_minimal() {
  section('Tier S - Greenfield (minimal: no precommit, no github)');
  const config = {
    ...BASE,
    tier: 's',
    isDiscovery: false,
    includePreCommit: false,
    includeGithub: false,
  };
  const dir = await scaffold('tier-s-minimal', 's', config);

  assertExists(dir, 'CLAUDE.md');
  assertExists(dir, '.claude/settings.json');
  assertExists(dir, '.claude/rules/pipeline.md');

  assertNotExists(dir, '.github');
  assertNotExists(dir, '.pre-commit-config.yaml');

  assertStopHookPresent(dir);
  assertNoUnfilledWizardPlaceholders(dir);
}

async function scenarioTierM() {
  section('Tier M - Greenfield (Standard)');
  const config = {
    ...BASE,
    tier: 'm',
    isDiscovery: false,
    e2eCommand: 'npx playwright test',
    hasE2E: true,
  };
  const dir = await scaffold('tier-m', 'm', config);

  // Core
  assertExists(dir, 'CLAUDE.md');
  assertExists(dir, 'README.md');
  assertExists(dir, '.claude/FIRST_SESSION.md');
  assertExists(dir, 'MEMORY.md');
  assertExists(dir, '.claude/settings.json');
  assertExists(dir, '.claude/rules/pipeline.md');

  // New shared rule files (tier M/L)
  assertExists(dir, '.claude/rules/output-style.md');
  assertExists(dir, 'docs/claudemd-standards.md');
  assertExists(dir, 'docs/pipeline-standards.md');

  // Docs
  assertExists(dir, 'docs/requirements.md');
  assertExists(dir, 'docs/implementation-checklist.md');
  assertExists(dir, 'docs/refactoring-backlog.md');
  assertExists(dir, 'docs/adr/template.md');
  assertExists(dir, 'docs/sitemap.md');
  assertExists(dir, 'docs/db-map.md');

  // Pipeline skills (M has dependency-scan, not context-review)
  assertExists(dir, '.claude/skills/dependency-scan/SKILL.md');
  assertNotExists(dir, '.claude/skills/context-review/SKILL.md');

  // Skills (M has full set - all flags enabled in BASE)
  assertExists(dir, '.claude/skills/arch-audit/SKILL.md');
  assertExists(dir, '.claude/skills/security-audit/SKILL.md');
  assertExists(dir, '.claude/skills/skill-dev/SKILL.md');
  assertExists(dir, '.claude/skills/skill-db/SKILL.md');
  assertExists(dir, '.claude/skills/migration-audit/SKILL.md');
  assertExists(dir, '.claude/skills/api-design/SKILL.md');
  assertExists(dir, '.claude/skills/perf-audit/SKILL.md');
  assertExists(dir, '.claude/skills/simplify/SKILL.md');
  assertExists(dir, '.claude/skills/commit/SKILL.md');
  assertExists(dir, '.claude/skills/ui-audit/SKILL.md');
  assertExists(dir, '.claude/skills/accessibility-audit/SKILL.md');
  assertExists(dir, '.claude/skills/test-audit/SKILL.md');

  assertStopHookPresent(dir);
  assertStopHookResolved(dir);
  assertNoUnfilledWizardPlaceholders(dir);
}

async function scenarioTierL() {
  section('Tier L - Greenfield (Full)');
  const config = {
    ...BASE,
    tier: 'l',
    isDiscovery: false,
    e2eCommand: 'npx playwright test',
    hasE2E: true,
  };
  const dir = await scaffold('tier-l', 'l', config);

  // Core
  assertExists(dir, 'CLAUDE.md');
  assertExists(dir, '.claude/FIRST_SESSION.md');
  assertExists(dir, 'MEMORY.md');
  assertExists(dir, '.claude/settings.json');
  assertExists(dir, '.claude/rules/pipeline.md');

  // New shared rule files (tier M/L)
  assertExists(dir, '.claude/rules/output-style.md');
  assertExists(dir, 'docs/claudemd-standards.md');
  assertExists(dir, 'docs/pipeline-standards.md');

  // Conditional docs (all flags enabled in BASE)
  assertExists(dir, 'docs/sitemap.md');
  assertExists(dir, 'docs/db-map.md');

  // Both pipeline skills
  assertExists(dir, '.claude/skills/dependency-scan/SKILL.md');
  assertExists(dir, '.claude/skills/context-review/SKILL.md');

  // Full skill set (all flags enabled in BASE)
  assertExists(dir, '.claude/skills/arch-audit/SKILL.md');
  assertExists(dir, '.claude/skills/security-audit/SKILL.md');
  assertExists(dir, '.claude/skills/skill-dev/SKILL.md');
  assertExists(dir, '.claude/skills/skill-db/SKILL.md');
  assertExists(dir, '.claude/skills/migration-audit/SKILL.md');
  assertExists(dir, '.claude/skills/api-design/SKILL.md');
  assertExists(dir, '.claude/skills/perf-audit/SKILL.md');
  assertExists(dir, '.claude/skills/simplify/SKILL.md');
  assertExists(dir, '.claude/skills/responsive-audit/SKILL.md');
  assertExists(dir, '.claude/skills/ux-audit/SKILL.md');
  assertExists(dir, '.claude/skills/visual-audit/SKILL.md');
  assertExists(dir, '.claude/skills/commit/SKILL.md');
  assertExists(dir, '.claude/skills/ui-audit/SKILL.md');
  assertExists(dir, '.claude/skills/accessibility-audit/SKILL.md');
  assertExists(dir, '.claude/skills/test-audit/SKILL.md');

  assertStopHookPresent(dir);
  assertStopHookResolved(dir);
  assertNoUnfilledWizardPlaceholders(dir);
}

async function scenarioInPlaceSafe() {
  section('In-place - safe mode (existing files not overwritten)');

  const dir = path.join(OUTPUT_DIR, 'in-place-safe');
  await fs.ensureDir(dir);

  // Pre-seed a CLAUDE.md that must survive
  const originalContent = '# My Existing Project\n\nThis must not be overwritten.\n';
  await fs.writeFile(path.join(dir, 'CLAUDE.md'), originalContent);

  const config = { ...BASE, tier: 'm', isDiscovery: false, mode: 'in-place' };
  await scaffoldTierSafe('m', dir, config, TEMPLATES_DIR);

  // Existing file must be unchanged
  assertFileUnchanged(dir, 'CLAUDE.md', originalContent);

  // New files must have been created around it
  assertExists(dir, '.claude/settings.json');
  assertExists(dir, '.claude/rules/pipeline.md');
  assertExists(dir, 'docs/adr/template.md');
}

async function scenarioStopHookContent() {
  section('Stop hook - content correctness');

  // All tiers must have a Stop hook that runs the test command
  for (const tier of ['0', 's', 'm', 'l']) {
    const config = {
      ...BASE,
      tier,
      isDiscovery: tier === '0',
      includePreCommit: false,
      includeGithub: false,
      testCommand: 'npm run test:ci',
    };
    const scenarioDir = path.join(OUTPUT_DIR, `stop-hook-tier-${tier}`);
    await fs.ensureDir(scenarioDir);
    await scaffoldTier(tier, scenarioDir, config, TEMPLATES_DIR);

    const settingsPath = path.join(scenarioDir, '.claude/settings.json');
    if (!fs.existsSync(settingsPath)) {
      fail(`Tier ${tier}: .claude/settings.json missing`);
      continue;
    }

    const raw = fs.readFileSync(settingsPath, 'utf8');

    if (!raw.includes('"Stop"')) {
      fail(`Tier ${tier}: Stop hook absent`);
    } else {
      pass(`Tier ${tier}: Stop hook present`);
    }

    if (raw.includes('[TEST_COMMAND]')) {
      fail(`Tier ${tier}: [TEST_COMMAND] placeholder not resolved`);
    } else {
      pass(`Tier ${tier}: [TEST_COMMAND] resolved`);
    }

    if (raw.includes('npm run test:ci')) {
      pass(`Tier ${tier}: custom testCommand injected`);
    } else {
      warn(`Tier ${tier}: custom testCommand not found in settings.json`);
    }

    if (raw.includes('stop_hook_active')) {
      pass(`Tier ${tier}: stop_hook_active guard present in Stop hook`);
    } else {
      fail(`Tier ${tier}: stop_hook_active guard missing from Stop hook`);
    }
  }
}

async function scenarioArchAuditTimestamp() {
  section('Arch audit - timestamp system');

  for (const tier of ['s', 'm', 'l']) {
    const config = {
      ...BASE,
      tier,
      isDiscovery: false,
      includePreCommit: false,
      includeGithub: false,
    };
    const scenarioDir = path.join(OUTPUT_DIR, `arch-audit-ts-tier-${tier}`);
    await fs.ensureDir(scenarioDir);
    await scaffoldTier(tier, scenarioDir, config, TEMPLATES_DIR);

    const settingsPath = path.join(scenarioDir, '.claude/settings.json');
    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, 'utf8');
      if (raw.includes('.claude/session/last-arch-audit')) {
        pass(`Tier ${tier}: SessionStart reads from .claude/session/last-arch-audit`);
      } else {
        fail(
          `Tier ${tier}: SessionStart still uses external ~/.claude/projects/ path for last-audit`,
        );
      }
    }

    const skillPath = path.join(scenarioDir, '.claude/skills/arch-audit/SKILL.md');
    if (fs.existsSync(skillPath)) {
      const skillRaw = fs.readFileSync(skillPath, 'utf8');
      if (skillRaw.includes('last-arch-audit')) {
        pass(`Tier ${tier}: arch-audit Step 5 writes last-arch-audit timestamp`);
      } else {
        fail(`Tier ${tier}: arch-audit Step 5 bash block is empty - timestamp never written`);
      }
    }
  }
}

async function scenarioPerfAuditPlaceholders() {
  section('perf-audit - placeholder resolution + applicability guard');

  for (const tier of ['m', 'l']) {
    const config = { ...BASE, tier, isDiscovery: false, hasFrontend: true, hasApi: true };
    const scenarioDir = path.join(OUTPUT_DIR, `perf-audit-tier-${tier}`);
    await fs.ensureDir(scenarioDir);
    await scaffoldTier(tier, scenarioDir, config, TEMPLATES_DIR);

    const skillPath = path.join(scenarioDir, '.claude/skills/perf-audit/SKILL.md');
    if (!fs.existsSync(skillPath)) {
      fail(`Tier ${tier}: perf-audit/SKILL.md missing`);
      continue;
    }
    const raw = fs.readFileSync(skillPath, 'utf8');

    for (const placeholder of [
      '[FRAMEWORK]',
      '[SITEMAP_OR_ROUTE_LIST]',
      '[API_ROUTES_PATH]',
      '[BUNDLE_TOOL]',
    ]) {
      if (raw.includes(placeholder)) {
        fail(`Tier ${tier}: perf-audit contains unresolved placeholder ${placeholder}`);
      } else {
        pass(`Tier ${tier}: perf-audit placeholder ${placeholder} resolved`);
      }
    }

    if (raw.includes('Applicability check')) {
      pass(`Tier ${tier}: perf-audit Applicability check present`);
    } else {
      fail(`Tier ${tier}: perf-audit Applicability check missing`);
    }
  }
}

async function scenarioSkillDevApplicabilityCheck() {
  section('skill-dev - applicability guard present (tier M/L)');

  for (const tier of ['m', 'l']) {
    const config = { ...BASE, tier, isDiscovery: false };
    const scenarioDir = path.join(OUTPUT_DIR, `skill-dev-applicability-tier-${tier}`);
    await fs.ensureDir(scenarioDir);
    await scaffoldTier(tier, scenarioDir, config, TEMPLATES_DIR);

    const skillPath = path.join(scenarioDir, '.claude/skills/skill-dev/SKILL.md');
    if (!fs.existsSync(skillPath)) {
      fail(`Tier ${tier}: skill-dev/SKILL.md missing`);
      continue;
    }
    const raw = fs.readFileSync(skillPath, 'utf8');

    if (raw.includes('Applicability check')) {
      pass(`Tier ${tier}: skill-dev Applicability check present`);
    } else {
      fail(`Tier ${tier}: skill-dev Applicability check missing`);
    }

    if (raw.includes('CHECK D9') && raw.includes('UI frameworks only')) {
      pass(`Tier ${tier}: skill-dev skip list includes D9 (lifecycle - UI frameworks only)`);
    } else {
      fail(`Tier ${tier}: skill-dev skip list missing D9 annotation`);
    }
  }
}

async function scenarioSkillPruning() {
  section('Skill pruning - no API, no DB, no frontend');
  const config = {
    ...BASE,
    tier: 'm',
    isDiscovery: false,
    hasApi: false,
    hasDatabase: false,
    hasFrontend: false,
  };
  const dir = await scaffold('tier-m-pruned', 'm', config);

  // Conditional docs must be absent (no frontend, no database)
  assertNotExists(dir, 'docs/sitemap.md');
  assertNotExists(dir, 'docs/db-map.md');

  // Skills that must be absent (hasApi=false → api-design pruned; hasDatabase=false → skill-db + migration-audit pruned)
  assertNotExists(dir, '.claude/skills/api-design/SKILL.md');
  assertExists(dir, '.claude/skills/security-audit/SKILL.md');
  assertNotExists(dir, '.claude/skills/skill-db/SKILL.md');
  assertNotExists(dir, '.claude/skills/migration-audit/SKILL.md');
  assertNotExists(dir, '.claude/skills/responsive-audit/SKILL.md');
  assertNotExists(dir, '.claude/skills/visual-audit/SKILL.md');
  assertNotExists(dir, '.claude/skills/ux-audit/SKILL.md');
  assertNotExists(dir, '.claude/skills/ui-audit/SKILL.md');
  assertNotExists(dir, '.claude/skills/accessibility-audit/SKILL.md');

  // Skills that must always be present
  assertExists(dir, '.claude/skills/arch-audit/SKILL.md');
  assertExists(dir, '.claude/skills/skill-dev/SKILL.md');
  assertExists(dir, '.claude/skills/perf-audit/SKILL.md');
  assertExists(dir, '.claude/skills/commit/SKILL.md');
  // test-audit has no `requires` flags - universally present in Tier M/L
  assertExists(dir, '.claude/skills/test-audit/SKILL.md');
}

async function scenarioTierSSkillPruning() {
  section('Tier S skill pruning - hasApi=false keeps security-audit (stack-agnostic)');
  const config = {
    ...BASE,
    tier: 's',
    isDiscovery: false,
    hasApi: false,
    hasDatabase: false,
    hasFrontend: false,
  };
  const dir = await scaffold('tier-s-pruned', 's', config);

  // security-audit must be present regardless of hasApi (has native security path)
  assertExists(dir, '.claude/skills/security-audit/SKILL.md');

  // Universal skills must remain
  assertExists(dir, '.claude/skills/arch-audit/SKILL.md');
  assertExists(dir, '.claude/skills/skill-dev/SKILL.md');
  assertExists(dir, '.claude/skills/perf-audit/SKILL.md');
  assertExists(dir, '.claude/skills/simplify/SKILL.md');
  assertExists(dir, '.claude/skills/commit/SKILL.md');

  // Active Skills must list security-audit
  const claude = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
  if (claude.includes('/security-audit')) {
    pass('Tier S pruned: Active Skills lists security-audit (stack-agnostic)');
  } else {
    fail('Tier S pruned: Active Skills should list security-audit even when hasApi=false');
  }

  // Active Skills must list universal skills
  if (
    claude.includes('/skill-dev') &&
    claude.includes('/perf-audit') &&
    claude.includes('/simplify')
  ) {
    pass('Tier S pruned: Active Skills lists universal skills');
  } else {
    fail('Tier S pruned: Active Skills missing universal skills');
  }
}

async function scenarioUiAuditPruning() {
  section('Skill pruning - frontend yes, design system no → ui-audit absent');
  const config = {
    ...BASE,
    tier: 'm',
    isDiscovery: false,
    hasFrontend: true,
    hasDesignSystem: false,
  };
  const dir = await scaffold('tier-m-no-design-system', 'm', config);

  // ui-audit requires design system - must be absent
  assertNotExists(dir, '.claude/skills/ui-audit/SKILL.md');

  // Other frontend skills must be present
  assertExists(dir, '.claude/skills/responsive-audit/SKILL.md');
  assertExists(dir, '.claude/skills/visual-audit/SKILL.md');
  assertExists(dir, '.claude/skills/ux-audit/SKILL.md');
  assertExists(dir, '.claude/skills/accessibility-audit/SKILL.md');
  assertExists(dir, '.claude/skills/test-audit/SKILL.md');
}

async function scenarioCommitSkillAllTiers() {
  section('Commit skill - present in tier S');
  const config = { ...BASE, tier: 's', isDiscovery: false };
  const dir = await scaffold('tier-s-commit', 's', config);
  assertExists(dir, '.claude/skills/commit/SKILL.md');
}

async function scenarioNewRuleFiles() {
  section('New rule files - output-style in tier S; standards docs skipped for S, present in M');
  const config = { ...BASE, tier: 's', isDiscovery: false };
  const dir = await scaffold('tier-s-rules', 's', config);

  // output-style.md stays in .claude/rules/ (operational rule - all tiers)
  assertExists(dir, '.claude/rules/output-style.md');
  // Standards reference docs skipped for Tier S (P2 - reduce file count)
  assertNotExists(dir, 'docs/claudemd-standards.md');
  assertNotExists(dir, 'docs/pipeline-standards.md');

  // Verify Tier M still gets standards docs
  const configM = { ...BASE, tier: 'm', isDiscovery: false };
  const dirM = await scaffold('tier-m-rules', 'm', configM);
  assertExists(dirM, '.claude/rules/output-style.md');
  assertExists(dirM, 'docs/claudemd-standards.md');
  assertExists(dirM, 'docs/pipeline-standards.md');
}

async function scenarioPipelineGateCount() {
  section('Pipeline gate counts per tier');

  // Tier S has scope-confirm (not a STOP gate) - 0 STOP gates by design
  const gateCounts = { m: 2, l: 4 };

  for (const [tier, expectedGates] of Object.entries(gateCounts)) {
    const config = { ...BASE, tier, isDiscovery: false };
    const scenarioDir = path.join(OUTPUT_DIR, `gates-tier-${tier}`);
    await fs.ensureDir(scenarioDir);
    await scaffoldTier(tier, scenarioDir, config, TEMPLATES_DIR);

    const pipelinePath = path.join(scenarioDir, '.claude/rules/pipeline.md');
    if (!fs.existsSync(pipelinePath)) {
      fail(`Tier ${tier}: pipeline.md missing`);
      continue;
    }

    const content = fs.readFileSync(pipelinePath, 'utf8');
    const stopMatches = (content.match(/STOP\s+GATE|STOP gate|\*\*STOP\*\*/gi) || []).length;

    if (stopMatches >= expectedGates) {
      pass(`Tier ${tier}: pipeline has ≥${expectedGates} STOP gate(s) (found ${stopMatches})`);
    } else {
      fail(`Tier ${tier}: expected ≥${expectedGates} STOP gate(s), found ${stopMatches}`);
    }
  }
}

// Template coverage scenarios — issue #138.
// Each delegates to a standalone script under packages/cli/test/template-coverage/.
// See docs/architecture/test-coverage-strategy.md for the rationale and registry.

const TEMPLATE_COVERAGE_DIR = path.resolve(__dirname, '../template-coverage');

function runTemplateCoverageScript(scriptName, label) {
  const scriptPath = path.join(TEMPLATE_COVERAGE_DIR, scriptName);
  try {
    const stdout = execFileSync('node', [scriptPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    pass(label);
    if (VERBOSE) console.log(stdout.toString());
  } catch (err) {
    const stdout = err.stdout ? err.stdout.toString() : '';
    const stderr = err.stderr ? err.stderr.toString() : '';
    const tail = (stdout + stderr).trim().split('\n').slice(-6).join(' | ');
    fail(label, tail || err.message);
  }
}

async function scenarioCrossTierLint() {
  section('Cross-tier semantic lint (issue #138, approach A)');
  runTemplateCoverageScript(
    'cross-tier-lint.mjs',
    'cross-tier lint: registry concepts aligned across tiers',
  );
}

async function scenarioGateEnumeration() {
  section('Gate clause enumeration (issue #138, approach B)');
  runTemplateCoverageScript(
    'gate-enum.mjs',
    'gate enumeration: per-tier gate counts above sanity threshold',
  );
}

async function scenarioPlaceholderCoverage() {
  section('Placeholder coverage on templates (issue #138, approach C)');
  runTemplateCoverageScript(
    'placeholder-check.mjs',
    'placeholder coverage: every UPPER_SNAKE_CASE placeholder documented',
  );
}

async function scenarioNewStacks() {
  section('New named stacks - placeholder resolution + basic structure');

  const newStacks = [
    {
      stack: 'swift',
      testCmd: 'swift test',
      devCmd: 'swift run',
      buildCmd: 'swift build -c release',
      installCmd: 'swift package resolve',
      label: 'Swift / macOS',
    },
    {
      stack: 'kotlin',
      testCmd: './gradlew test',
      devCmd: './gradlew run',
      buildCmd: './gradlew build',
      installCmd: './gradlew dependencies',
      label: 'Kotlin / Android',
    },
    {
      stack: 'rust',
      testCmd: 'cargo test',
      devCmd: 'cargo run',
      buildCmd: 'cargo build --release',
      installCmd: 'cargo build',
      label: 'Rust',
    },
    {
      stack: 'dotnet',
      testCmd: 'dotnet test',
      devCmd: 'dotnet run',
      buildCmd: 'dotnet build',
      installCmd: 'dotnet restore',
      label: '.NET / C#',
    },
    {
      stack: 'ruby',
      testCmd: 'bundle exec rspec',
      devCmd: 'bundle exec rails server',
      buildCmd: 'bundle exec rake assets:precompile',
      installCmd: 'bundle install',
      label: 'Ruby',
    },
    {
      stack: 'java',
      testCmd: 'mvn test',
      devCmd: 'mvn exec:java',
      buildCmd: 'mvn package',
      installCmd: 'mvn install',
      label: 'Java',
    },
  ];

  for (const { stack, testCmd, devCmd, buildCmd, installCmd } of newStacks) {
    const config = {
      ...BASE,
      tier: 'm',
      techStack: stack,
      testCommand: testCmd,
      devCommand: devCmd,
      buildCommand: buildCmd,
      installCommand: installCmd,
      typeCheckCommand: '',
      isDiscovery: false,
    };
    const dir = await scaffold(`new-stack-${stack}`, 'm', config);

    assertExists(dir, 'CLAUDE.md');
    assertExists(dir, '.claude/settings.json');
    assertStopHookResolved(dir);
    assertNoUnfilledWizardPlaceholders(dir);
  }
}

async function scenarioNativeStackCommandDefaults() {
  section('Native stack command defaults - no npm fallback when commands omitted');

  // Simulates detection failure: no commands supplied → should resolve to native defaults, not npm.
  const nativeDefaults = [
    { stack: 'swift', test: 'xcodebuild test', install: '# no install step' },
    { stack: 'kotlin', test: './gradlew test', install: '# no install step' },
    { stack: 'rust', test: 'cargo test', install: '# no install step' },
    { stack: 'dotnet', test: 'dotnet test', install: 'dotnet restore' },
    { stack: 'java', test: 'mvn test', install: 'mvn install' },
  ];

  for (const { stack, test: expectedTest, install: expectedInstall } of nativeDefaults) {
    const config = {
      ...BASE,
      tier: 'm',
      techStack: stack,
      testCommand: '',
      devCommand: '',
      buildCommand: '',
      installCommand: '',
      typeCheckCommand: '',
      isDiscovery: false,
    };
    const dir = await scaffold(`native-cmd-defaults-${stack}`, 'm', config);
    const claudeMd = path.join(dir, 'CLAUDE.md');
    if (!fs.existsSync(claudeMd)) {
      fail(`native-cmd-defaults[${stack}]: CLAUDE.md missing`);
      continue;
    }
    const content = fs.readFileSync(claudeMd, 'utf8');

    if (
      !content.includes('npm test') &&
      !content.includes('npm install') &&
      !content.includes('npm run')
    ) {
      pass(`native-cmd-defaults[${stack}]: no npm commands in CLAUDE.md`);
    } else {
      fail(`native-cmd-defaults[${stack}]: npm command found in CLAUDE.md for native stack`);
    }

    if (content.includes(expectedTest)) {
      pass(`native-cmd-defaults[${stack}]: test command = ${expectedTest}`);
    } else {
      fail(`native-cmd-defaults[${stack}]: expected test command "${expectedTest}" not found`);
    }

    if (content.includes(expectedInstall)) {
      pass(`native-cmd-defaults[${stack}]: install command = ${expectedInstall}`);
    } else {
      fail(
        `native-cmd-defaults[${stack}]: expected install command "${expectedInstall}" not found`,
      );
    }
  }
}

async function scenarioWizardCoverage() {
  section('Wizard coverage - full CLI execution via --answers');

  const CLI = path.resolve(__dirname, '../../src/index.js');
  const FIXTURES_DIR = path.resolve(__dirname, '../fixtures/wizard-answers');

  const fixtures = fs
    .readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

  for (const fixtureFile of fixtures) {
    const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, fixtureFile), 'utf8'));
    const label = path.basename(fixtureFile, '.json');
    const dir = path.join(OUTPUT_DIR, `wizard-${label}`);
    await fs.ensureDir(dir);

    const answersJson = JSON.stringify(fixture);

    try {
      execFileSync('node', [CLI, 'init', '--answers', answersJson], {
        cwd: dir,
        stdio: 'pipe',
      });
      pass(`wizard[${label}]: execution succeeded`);
    } catch (err) {
      const detail = err.stderr?.toString().trim().split('\n')[0] || err.message;
      fail(`wizard[${label}]: execution failed`, detail);
      continue;
    }

    assertExists(dir, '.claude/settings.json');
    assertStopHookResolved(dir);
    assertNoUnfilledWizardPlaceholders(dir);
  }
}

async function scenarioSecurityVariants() {
  section('Security rule variants - stack-aware security.md selection');

  const variants = [
    {
      stack: 'swift',
      hasApi: true,
      expected: 'Native Apple',
      label: 'swift → native-apple',
      denyIncludes: 'xcodebuild archive',
    },
    {
      stack: 'kotlin',
      hasApi: true,
      expected: 'Native Android',
      label: 'kotlin → native-android',
      denyIncludes: 'gradlew publish',
    },
    {
      stack: 'rust',
      hasApi: false,
      expected: 'Systems & Backend',
      label: 'rust (no API) → systems',
      denyIncludes: 'cargo publish',
    },
    {
      stack: 'go',
      hasApi: false,
      expected: 'Systems & Backend',
      label: 'go (no API) → systems',
      denyIncludes: null,
    },
    {
      stack: 'rust',
      hasApi: true,
      expected: 'Security Rules\n',
      label: 'rust (with API) → web',
      denyIncludes: 'cargo publish',
    },
    {
      stack: 'node-ts',
      hasApi: true,
      expected: 'Security Rules\n',
      label: 'node-ts → web',
      denyIncludes: null,
    },
  ];

  for (const { stack, hasApi, expected, label, denyIncludes } of variants) {
    const config = {
      ...BASE,
      tier: 'm',
      techStack: stack,
      hasApi,
      isDiscovery: false,
    };
    const dir = await scaffold(
      `security-variant-${stack}-${hasApi ? 'api' : 'noapi'}`,
      'm',
      config,
    );
    const securityPath = path.join(dir, '.claude', 'rules', 'security.md');

    if (!fs.existsSync(securityPath)) {
      fail(`security-variant[${label}]: security.md missing`);
      continue;
    }

    const content = fs.readFileSync(securityPath, 'utf8');
    if (content.includes(expected)) {
      pass(`security-variant[${label}]: correct variant`);
    } else {
      fail(`security-variant[${label}]: expected "${expected}" in security.md`);
    }

    // Verify no other security variant files leaked into output
    const rulesDir = path.join(dir, '.claude', 'rules');
    const ruleFiles = fs.readdirSync(rulesDir);
    const securityFiles = ruleFiles.filter((f) => f.startsWith('security'));
    if (securityFiles.length === 1 && securityFiles[0] === 'security.md') {
      pass(`security-variant[${label}]: no variant files leaked`);
    } else {
      fail(`security-variant[${label}]: unexpected security files: ${securityFiles.join(', ')}`);
    }

    // Verify stack-specific deny entries in settings.json
    if (denyIncludes) {
      const settingsPath = path.join(dir, '.claude', 'settings.json');
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const denyList = (settings.permissions?.deny || []).join(' ');
      if (denyList.includes(denyIncludes)) {
        pass(`security-variant[${label}]: deny includes ${denyIncludes}`);
      } else {
        fail(`security-variant[${label}]: deny missing ${denyIncludes}`);
      }
    }

    // security-audit is always present (stack-agnostic, has native security path)
    assertExists(dir, '.claude/skills/security-audit/SKILL.md');
  }
}

async function scenarioPlaceholderNoiseReduction() {
  section('Placeholder noise reduction - unfilled sections stripped from CLAUDE.md');

  // Tier M - RBAC, Key Workflows, Known Patterns stripped
  const configM = { ...BASE, tier: 'm', isDiscovery: false };
  const dirM = await scaffold('noise-reduction-tier-m', 'm', configM);
  const claudeM = fs.readFileSync(path.join(dirM, 'CLAUDE.md'), 'utf8');

  for (const stripped of ['## RBAC / Roles', '## Key Workflows', '## Known Patterns']) {
    if (!claudeM.includes(stripped)) {
      pass(`Tier M: section "${stripped}" stripped`);
    } else {
      fail(`Tier M: section "${stripped}" should be stripped`);
    }
  }

  for (const kept of [
    '## Overview',
    '## Tech Stack',
    '## Key Commands',
    '## Coding Conventions',
    '## Interaction Protocol',
    '## Reference Documents',
    '## Environment',
  ]) {
    if (claudeM.includes(kept)) {
      pass(`Tier M: section "${kept}" preserved`);
    } else {
      fail(`Tier M: section "${kept}" should be preserved`);
    }
  }

  // Tier L - additionally strips Navigation by Role
  const configL = {
    ...BASE,
    tier: 'l',
    isDiscovery: false,
    e2eCommand: 'npx playwright test',
    hasE2E: true,
  };
  const dirL = await scaffold('noise-reduction-tier-l', 'l', configL);
  const claudeL = fs.readFileSync(path.join(dirL, 'CLAUDE.md'), 'utf8');

  for (const stripped of [
    '## RBAC / Roles',
    '## Key Workflows',
    '## Navigation by Role',
    '## Known Patterns',
  ]) {
    if (!claudeL.includes(stripped)) {
      pass(`Tier L: section "${stripped}" stripped`);
    } else {
      fail(`Tier L: section "${stripped}" should be stripped`);
    }
  }

  for (const kept of [
    '## Overview',
    '## Tech Stack',
    '## Key Commands',
    '## Interaction Protocol',
    '## Reference Documents',
    '## Environment',
  ]) {
    if (claudeL.includes(kept)) {
      pass(`Tier L: section "${kept}" preserved`);
    } else {
      fail(`Tier L: section "${kept}" should be preserved`);
    }
  }

  // Verify CLAUDE.md line count reduced (raw template ~92 lines with injections, stripped should be < 90).
  // The threshold scales linearly with the Active Skills list (one line per skill); raise it as new skills
  // are added to the registry so this guard catches regressions, not growth.
  const lineCountM = claudeM.split('\n').length;
  if (lineCountM < 90) {
    pass(`Tier M: CLAUDE.md line count reduced (${lineCountM} lines)`);
  } else {
    fail(`Tier M: CLAUDE.md still ${lineCountM} lines - expected < 90 after stripping`);
  }

  // Tier S - Known Patterns stripped (only section applicable)
  const configS = { ...BASE, tier: 's', isDiscovery: false };
  const dirS = await scaffold('noise-reduction-tier-s', 's', configS);
  const claudeS = fs.readFileSync(path.join(dirS, 'CLAUDE.md'), 'utf8');

  if (!claudeS.includes('## Known Patterns')) {
    pass('Tier S: section "## Known Patterns" stripped');
  } else {
    fail('Tier S: section "## Known Patterns" should be stripped');
  }

  // Native stack (swift, hasApi=false) - web convention stripped, no [HAS_API] literal
  const configNative = {
    ...BASE,
    tier: 'm',
    isDiscovery: false,
    techStack: 'swift',
    hasApi: false,
    hasDatabase: false,
    hasFrontend: false,
    hasDesignSystem: false,
  };
  const dirNative = await scaffold('noise-reduction-native', 'm', configNative);
  const claudeNative = fs.readFileSync(path.join(dirNative, 'CLAUDE.md'), 'utf8');

  if (!claudeNative.includes('Every API route')) {
    pass('Native: "Every API route" convention stripped');
  } else {
    fail('Native: "Every API route" convention should be stripped when hasApi=false');
  }

  // No [HAS_API] literal should appear in any scaffolded skill file
  const skillFiles = walkFiles(path.join(dirNative, '.claude', 'skills'));
  let hasApiLiteral = false;
  for (const f of skillFiles) {
    const content = fs.readFileSync(f, 'utf8');
    if (content.includes('[HAS_API]')) {
      hasApiLiteral = true;
      fail(`[HAS_API] placeholder found in ${path.relative(dirNative, f)}`);
    }
  }
  if (!hasApiLiteral) {
    pass('Native: no [HAS_API] placeholder in skill files');
  }
}

async function scenarioInPlaceClaudeMdGeneration() {
  section('In-place - generateClaudeMd runs when no pre-existing CLAUDE.md');

  const dir = path.join(OUTPUT_DIR, 'in-place-claudemd-gen');
  await fs.ensureDir(dir);

  // No pre-existing CLAUDE.md - scaffold should generate a processed one
  const config = {
    ...BASE,
    tier: 'm',
    isDiscovery: false,
    mode: 'in-place',
    techStack: 'swift',
    hasApi: false,
    hasDatabase: false,
    hasFrontend: false,
    hasDesignSystem: false,
    testCommand: 'xcodebuild test -scheme TestProject',
  };
  await scaffoldTierSafe('m', dir, config, TEMPLATES_DIR);

  // Simulate what init-in-place.js does: call generateClaudeMd when no pre-existing CLAUDE.md
  await generateClaudeMd(config, dir);

  const claude = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');

  // Active Skills section must be present
  if (claude.includes('## Active Skills')) {
    pass('in-place gen: Active Skills section present');
  } else {
    fail('in-place gen: Active Skills section missing');
  }

  // Unfilled sections must be stripped
  for (const stripped of ['## RBAC / Roles', '## Key Workflows', '## Known Patterns']) {
    if (!claude.includes(stripped)) {
      pass(`in-place gen: "${stripped}" stripped`);
    } else {
      fail(`in-place gen: "${stripped}" should be stripped`);
    }
  }

  // Web-centric convention must be stripped for hasApi=false
  if (!claude.includes('Every API route')) {
    pass('in-place gen: "Every API route" convention stripped for native');
  } else {
    fail('in-place gen: "Every API route" convention should be stripped when hasApi=false');
  }

  // Native stack: Auth/Storage/Email placeholders removed
  if (!claude.includes('**Auth**:')) {
    pass('in-place gen: Auth placeholder removed for native');
  } else {
    fail('in-place gen: Auth placeholder should be removed for native stack');
  }

  // Deploy should have native default
  if (claude.includes('_native distribution_')) {
    pass('in-place gen: Deploy has native default');
  } else {
    fail('in-place gen: Deploy should show native distribution for native stack');
  }
}

async function scenarioCheatsheetPruning() {
  section('Cheatsheet pruning - removed skills stripped from cheatsheet');

  const config = { ...BASE, tier: 'm', isDiscovery: false, hasApi: false, hasDatabase: false };
  const dir = await scaffold('cheatsheet-pruning', 'm', config);

  const cheatPath = path.join(dir, '.claude', 'cheatsheet.md');
  if (!fs.existsSync(cheatPath)) {
    fail('cheatsheet pruning: cheatsheet.md missing');
    return;
  }
  const cheat = fs.readFileSync(cheatPath, 'utf8');

  if (!cheat.includes('/api-design')) {
    pass('cheatsheet: /api-design row removed (hasApi=false)');
  } else {
    fail('cheatsheet: /api-design row should be removed when hasApi=false');
  }

  if (!cheat.includes('/skill-db')) {
    pass('cheatsheet: /skill-db row removed (hasDatabase=false)');
  } else {
    fail('cheatsheet: /skill-db row should be removed when hasDatabase=false');
  }

  if (!cheat.includes('/migration-audit')) {
    pass('cheatsheet: /migration-audit row removed (hasDatabase=false)');
  } else {
    fail('cheatsheet: /migration-audit row should be removed when hasDatabase=false');
  }

  if (cheat.includes('/security-audit')) {
    pass('cheatsheet: /security-audit row present (stack-agnostic, not API-gated)');
  } else {
    fail('cheatsheet: /security-audit row should be present regardless of hasApi');
  }

  // Doc reference must be correct
  if (cheat.includes('refactoring-backlog.md')) {
    pass('cheatsheet: correct doc reference (refactoring-backlog.md)');
  } else {
    fail('cheatsheet: wrong doc reference - expected refactoring-backlog.md');
  }

  if (!cheat.includes('backlog-refinement.md')) {
    pass('cheatsheet: old doc reference (backlog-refinement.md) absent');
  } else {
    fail('cheatsheet: old doc reference backlog-refinement.md still present');
  }
}

async function scenarioNativeSkillAdaptation() {
  section('Native skill adaptation - perf-audit, skill-dev, security-audit for non-web stacks');

  const stacks = [
    { stack: 'swift', perfTool: 'Instruments', lintCmd: 'swiftlint', secChecklist: 'Keychain API' },
    {
      stack: 'kotlin',
      perfTool: 'Android Studio',
      lintCmd: 'detekt',
      secChecklist: 'Android Keystore',
    },
    { stack: 'rust', perfTool: 'cargo bench', lintCmd: 'clippy', secChecklist: 'unsafe block' },
    { stack: 'go', perfTool: 'pprof', lintCmd: 'staticcheck', secChecklist: 'Goroutine leak' },
    {
      stack: 'python',
      perfTool: 'cProfile',
      lintCmd: 'ruff',
      secChecklist: 'Pickle deserialization',
    },
    { stack: 'ruby', perfTool: 'stackprof', lintCmd: 'rubocop', secChecklist: 'Mass assignment' },
    { stack: 'java', perfTool: 'JProfiler', lintCmd: 'spotbugs', secChecklist: 'Deserialization' },
    {
      stack: 'dotnet',
      perfTool: 'dotTrace',
      lintCmd: 'dotnet format',
      secChecklist: 'Configuration secrets',
    },
  ];

  for (const { stack, perfTool, lintCmd, secChecklist } of stacks) {
    // security-audit is always present (stack-agnostic)
    const config = {
      ...BASE,
      tier: 'm',
      techStack: stack,
      hasApi: true,
      hasDatabase: true,
      hasFrontend: false,
      hasDesignSystem: false,
      isDiscovery: false,
    };
    const dir = await scaffold(`native-skill-${stack}`, 'm', config);

    // perf-audit: native path present with resolved tool placeholders
    const perfPath = path.join(dir, '.claude', 'skills', 'perf-audit', 'SKILL.md');
    if (fs.existsSync(perfPath)) {
      const perf = fs.readFileSync(perfPath, 'utf8');

      if (perf.includes('Step 6') && perf.includes('Native/Backend Performance Audit')) {
        pass(`native-skill[${stack}]: perf-audit has native path (Step 6)`);
      } else {
        fail(`native-skill[${stack}]: perf-audit missing native path`);
      }

      if (perf.includes(perfTool)) {
        pass(`native-skill[${stack}]: perf-audit [PERF_TOOL] resolved to ${perfTool}`);
      } else {
        fail(`native-skill[${stack}]: perf-audit [PERF_TOOL] not resolved - expected ${perfTool}`);
      }

      if (!perf.includes('[PERF_TOOL]') && !perf.includes('[PROFILER_COMMAND]')) {
        pass(`native-skill[${stack}]: perf-audit no unresolved placeholders`);
      } else {
        fail(`native-skill[${stack}]: perf-audit has unresolved placeholders`);
      }

      // Must NOT exit for native stacks anymore
      if (!perf.includes('output the following and stop')) {
        pass(`native-skill[${stack}]: perf-audit no exit guard for native`);
      } else {
        fail(`native-skill[${stack}]: perf-audit still exits for native stacks`);
      }
    } else {
      fail(`native-skill[${stack}]: perf-audit/SKILL.md missing`);
    }

    // skill-dev: language-specific checks present with resolved lint command
    const devPath = path.join(dir, '.claude', 'skills', 'skill-dev', 'SKILL.md');
    if (fs.existsSync(devPath)) {
      const dev = fs.readFileSync(devPath, 'utf8');

      if (dev.includes('DL1') && dev.includes('Language-specific')) {
        pass(`native-skill[${stack}]: skill-dev has DL1 language-specific checks`);
      } else {
        fail(`native-skill[${stack}]: skill-dev missing DL1 checks`);
      }

      if (dev.includes(lintCmd)) {
        pass(`native-skill[${stack}]: skill-dev [LINT_COMMAND] resolved to ${lintCmd}`);
      } else {
        fail(`native-skill[${stack}]: skill-dev [LINT_COMMAND] not resolved - expected ${lintCmd}`);
      }

      if (!dev.includes('[LINT_COMMAND]')) {
        pass(`native-skill[${stack}]: skill-dev no unresolved [LINT_COMMAND]`);
      } else {
        fail(`native-skill[${stack}]: skill-dev has unresolved [LINT_COMMAND]`);
      }
    } else {
      fail(`native-skill[${stack}]: skill-dev/SKILL.md missing`);
    }

    // security-audit: native checklist present with resolved items
    const secPath = path.join(dir, '.claude', 'skills', 'security-audit', 'SKILL.md');
    if (fs.existsSync(secPath)) {
      const sec = fs.readFileSync(secPath, 'utf8');

      if (sec.includes('Step 3e') && sec.includes('Native application security')) {
        pass(`native-skill[${stack}]: security-audit has native supplement (Step 3e)`);
      } else {
        fail(`native-skill[${stack}]: security-audit missing native supplement`);
      }

      if (sec.includes(secChecklist)) {
        pass(
          `native-skill[${stack}]: security-audit checklist resolved - contains ${secChecklist}`,
        );
      } else {
        fail(
          `native-skill[${stack}]: security-audit checklist not resolved - expected ${secChecklist}`,
        );
      }

      if (!sec.includes('[SECURITY_CHECKLIST_ITEMS]')) {
        pass(`native-skill[${stack}]: security-audit no unresolved [SECURITY_CHECKLIST_ITEMS]`);
      } else {
        fail(`native-skill[${stack}]: security-audit has unresolved [SECURITY_CHECKLIST_ITEMS]`);
      }
    } else {
      fail(`native-skill[${stack}]: security-audit/SKILL.md missing`);
    }
  }

  // Additional: verify node-ts (web stack) still gets web path, no exit
  const webConfig = { ...BASE, tier: 'm', isDiscovery: false };
  const webDir = await scaffold('native-skill-web-baseline', 'm', webConfig);
  const webPerf = fs.readFileSync(
    path.join(webDir, '.claude', 'skills', 'perf-audit', 'SKILL.md'),
    'utf8',
  );
  if (webPerf.includes('Step 1') && webPerf.includes('Step 6')) {
    pass('web-baseline: perf-audit has both web (Step 1) and native (Step 6) paths');
  } else {
    fail('web-baseline: perf-audit missing expected paths');
  }
}

// ── excludeNative edge case ─────────────────────────────────────────────────

async function scenarioExcludeNativeWithFrontend() {
  section('excludeNative - native stack with hasFrontend:true still excludes browser-only skills');

  const nativeStacks = ['swift', 'kotlin', 'rust'];
  for (const stack of nativeStacks) {
    const config = {
      ...BASE,
      tier: 'm',
      techStack: stack,
      hasApi: true,
      hasDatabase: true,
      hasFrontend: true,
      hasDesignSystem: true,
      isDiscovery: false,
    };
    const dir = await scaffold(`excludeNative-${stack}`, 'm', config);

    // Browser-dependent audit skills must be absent despite hasFrontend: true
    assertNotExists(dir, '.claude/skills/responsive-audit/SKILL.md');
    assertNotExists(dir, '.claude/skills/visual-audit/SKILL.md');
    assertNotExists(dir, '.claude/skills/ux-audit/SKILL.md');
    assertNotExists(dir, '.claude/skills/accessibility-audit/SKILL.md');

    // Non-browser skills must remain present
    assertExists(dir, '.claude/skills/security-audit/SKILL.md');
    assertExists(dir, '.claude/skills/perf-audit/SKILL.md');
    assertExists(dir, '.claude/skills/test-audit/SKILL.md');
    assertExists(dir, '.claude/skills/arch-audit/SKILL.md');

    // ui-audit uses hasDesignSystem gating, not excludeNative - present when design system = true
    assertExists(dir, '.claude/skills/ui-audit/SKILL.md');
  }
}

// ── Rubric scoring ──────────────────────────────────────────────────────────

const rubricDims = {};

function rubricPass(dim, label) {
  if (!rubricDims[dim]) rubricDims[dim] = { passed: 0, failed: 0 };
  rubricDims[dim].passed++;
  pass(`rubric ${dim}: ${label}`);
}

function rubricFail(dim, label) {
  if (!rubricDims[dim]) rubricDims[dim] = { passed: 0, failed: 0 };
  rubricDims[dim].failed++;
  fail(`rubric ${dim}: ${label}`);
}

function computeDScore(dim) {
  const d = rubricDims[dim];
  if (!d || d.passed + d.failed === 0) return 0;
  const rate = d.passed / (d.passed + d.failed);
  if (rate >= 1.0) return 3;
  if (rate >= 0.66) return 2;
  if (rate >= 0.33) return 1;
  return 0;
}

function resetRubricDims() {
  for (const k of Object.keys(rubricDims)) delete rubricDims[k];
}

async function scenarioRubricScore() {
  section('Rubric scoring - D2/D5/D7/D8 for 3 representative stacks');

  const rubricConfigs = [
    {
      name: 'node-ts',
      config: { ...BASE, tier: 'm', techStack: 'node-ts', isDiscovery: false },
      isNative: false,
      expectedFramework: null, // node-ts uses wizard default
      hasApi: true,
    },
    {
      name: 'swift',
      config: {
        ...BASE,
        tier: 'm',
        techStack: 'swift',
        isDiscovery: false,
        hasApi: false,
        hasFrontend: false,
        hasDatabase: false,
        hasDesignSystem: false,
        installCommand: '# no install step',
        devCommand: 'swift run',
        buildCommand: 'xcodebuild build',
        testCommand: 'xcodebuild test',
      },
      isNative: true,
      expectedFramework: 'N/A',
      hasApi: false,
    },
    {
      name: 'python',
      config: { ...BASE, tier: 'm', techStack: 'python', isDiscovery: false },
      isNative: false,
      expectedFramework: null,
      hasApi: true,
    },
  ];

  const weights = { D2: 1.0, D5: 1.0, D7: 2.0, D8: 1.0 };
  const maxWeighted = Object.values(weights).reduce((a, b) => a + b * 3, 0); // 15

  for (const { name, config, isNative, expectedFramework, hasApi } of rubricConfigs) {
    resetRubricDims();
    const dir = await scaffold(`rubric-${name}`, 'm', config);
    const claudeMd = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');

    // ── D2: Commands & conventions ──────────────────────────────────────
    const commandPlaceholders = [
      '[INSTALL_COMMAND]',
      '[DEV_COMMAND]',
      '[BUILD_COMMAND]',
      '[TEST_COMMAND]',
      '[TYPE_CHECK_COMMAND]',
    ];
    const hasCommandPlaceholder = commandPlaceholders.some((p) => claudeMd.includes(p));
    if (!hasCommandPlaceholder) {
      rubricPass('D2', `[${name}] no command placeholders in CLAUDE.md`);
    } else {
      rubricFail('D2', `[${name}] command placeholder found in CLAUDE.md`);
    }

    if (isNative) {
      // Extract Key Commands block
      const cmdMatch = claudeMd.match(/```bash([\s\S]*?)```/);
      const cmdBlock = cmdMatch ? cmdMatch[1] : '';
      if (!cmdBlock.includes('npm ')) {
        rubricPass('D2', `[${name}] no npm in Key Commands for native stack`);
      } else {
        rubricFail('D2', `[${name}] npm found in Key Commands for native stack`);
      }
    }

    if (!hasApi) {
      if (!claudeMd.includes('Every API route')) {
        rubricPass('D2', `[${name}] no "Every API route" convention when hasApi=false`);
      } else {
        rubricFail('D2', `[${name}] "Every API route" convention present when hasApi=false`);
      }
    }

    // ── D5: Skill relevance ─────────────────────────────────────────────
    if (claudeMd.includes('## Active Skills')) {
      rubricPass('D5', `[${name}] Active Skills section present`);
    } else {
      rubricFail('D5', `[${name}] Active Skills section missing`);
    }

    // Extract skill names from Active Skills section
    const activeMatch = claudeMd.match(/## Active Skills\n([\s\S]*?)(?:\n## |\n$|$)/);
    const activeBlock = activeMatch ? activeMatch[1] : '';
    const listedSkills = [...activeBlock.matchAll(/`\/([a-z-]+)`/g)].map((m) => m[1]);

    // Every listed skill must exist on disk
    for (const skill of listedSkills) {
      const skillPath = path.join(dir, '.claude', 'skills', skill, 'SKILL.md');
      if (fs.existsSync(skillPath)) {
        rubricPass('D5', `[${name}] listed skill /${skill} exists on disk`);
      } else {
        rubricFail('D5', `[${name}] listed skill /${skill} missing from disk`);
      }
    }

    // No pruned skill should be listed (security-audit is always present - not API-gated)
    if (!hasApi) {
      if (!activeBlock.includes('/api-design')) {
        rubricPass('D5', `[${name}] no API-only skills listed when hasApi=false`);
      } else {
        rubricFail('D5', `[${name}] API-only skill listed when hasApi=false`);
      }
    }

    // Cheatsheet consistency
    const cheatPath = path.join(dir, '.claude', 'cheatsheet.md');
    if (fs.existsSync(cheatPath)) {
      const cheat = fs.readFileSync(cheatPath, 'utf8');
      let cheatClean = true;
      if (!hasApi && cheat.includes('/api-design')) cheatClean = false;
      if (config.hasDatabase === false && cheat.includes('/skill-db')) cheatClean = false;
      if (config.hasDatabase === false && cheat.includes('/migration-audit')) cheatClean = false;
      if (cheatClean) {
        rubricPass('D5', `[${name}] cheatsheet has no phantom skill rows`);
      } else {
        rubricFail('D5', `[${name}] cheatsheet lists pruned skills`);
      }
    }

    // ── D7: Safety & guardrails ─────────────────────────────────────────
    const settingsPath = path.join(dir, '.claude', 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

      // Stop hook
      const hooks = settings.hooks;
      if (hooks && hooks.Stop && Array.isArray(hooks.Stop) && hooks.Stop.length > 0) {
        rubricPass('D7', `[${name}] Stop hook present`);
      } else {
        rubricFail('D7', `[${name}] Stop hook missing`);
      }

      // Stop hook resolved
      const hookStr = JSON.stringify(hooks);
      if (!hookStr.includes('[TEST_COMMAND]')) {
        rubricPass('D7', `[${name}] Stop hook test command resolved`);
      } else {
        rubricFail('D7', `[${name}] Stop hook has unresolved [TEST_COMMAND]`);
      }

      // Deny list
      const deny = settings.permissions && settings.permissions.deny;
      if (Array.isArray(deny) && deny.length > 0) {
        rubricPass('D7', `[${name}] permissions.deny non-empty`);
      } else {
        rubricFail('D7', `[${name}] permissions.deny empty or missing`);
      }

      if (Array.isArray(deny) && deny.some((d) => d.includes('push --force'))) {
        rubricPass('D7', `[${name}] deny blocks force-push`);
      } else {
        rubricFail('D7', `[${name}] deny missing force-push block`);
      }

      if (Array.isArray(deny) && deny.some((d) => d.includes('push origin main'))) {
        rubricPass('D7', `[${name}] deny blocks push to main`);
      } else {
        rubricFail('D7', `[${name}] deny missing push-to-main block`);
      }
    } else {
      rubricFail('D7', `[${name}] settings.json missing`);
    }

    // Security rule file
    if (fs.existsSync(path.join(dir, '.claude', 'rules', 'security.md'))) {
      rubricPass('D7', `[${name}] security.md rule file present`);
    } else {
      rubricFail('D7', `[${name}] security.md rule file missing`);
    }

    // ── D8: Cross-file coherence ────────────────────────────────────────
    // Test command coherence: CLAUDE.md Key Commands vs Stop hook
    const cmdBlockMatch = claudeMd.match(/```bash([\s\S]*?)```/);
    const cmdBlockText = cmdBlockMatch ? cmdBlockMatch[1] : '';
    const testCmd = config.testCommand;
    if (cmdBlockText.includes(testCmd)) {
      rubricPass('D8', `[${name}] test command in CLAUDE.md matches config`);
    } else {
      rubricFail('D8', `[${name}] test command mismatch in CLAUDE.md`);
    }

    // Framework value resolved
    if (expectedFramework) {
      if (claudeMd.includes(expectedFramework)) {
        rubricPass('D8', `[${name}] Framework value resolved (${expectedFramework})`);
      } else {
        rubricFail('D8', `[${name}] Framework value not resolved`);
      }
    } else {
      // For non-native: just check it's not a placeholder
      if (!claudeMd.includes('[FRAMEWORK_VALUE]')) {
        rubricPass('D8', `[${name}] Framework placeholder resolved`);
      } else {
        rubricFail('D8', `[${name}] Framework placeholder unresolved`);
      }
    }

    // Cheatsheet doc reference
    if (fs.existsSync(cheatPath)) {
      const cheat = fs.readFileSync(cheatPath, 'utf8');
      if (!cheat.includes('backlog-refinement.md')) {
        rubricPass('D8', `[${name}] cheatsheet has correct doc reference`);
      } else {
        rubricFail('D8', `[${name}] cheatsheet has stale backlog-refinement.md reference`);
      }
    }

    // No [HAS_API] literal in skills
    const skillsDir = path.join(dir, '.claude', 'skills');
    const skillFiles = fs.existsSync(skillsDir) ? walkFiles(skillsDir) : [];
    const hasApiLiteral = skillFiles.some((f) => {
      if (!f.endsWith('.md')) return false;
      return fs.readFileSync(f, 'utf8').includes('[HAS_API]');
    });
    if (!hasApiLiteral) {
      rubricPass('D8', `[${name}] no [HAS_API] literal in skill files`);
    } else {
      rubricFail('D8', `[${name}] [HAS_API] literal found in skill files`);
    }

    // ── Aggregate ───────────────────────────────────────────────────────
    const scores = {};
    let weightedTotal = 0;
    for (const dim of ['D2', 'D5', 'D7', 'D8']) {
      scores[dim] = computeDScore(dim);
      weightedTotal += scores[dim] * weights[dim];
    }
    const pct = Math.round((weightedTotal / maxWeighted) * 100);
    console.log(
      `  ${c.cyan('◆')} Rubric [${name}]: D2=${scores.D2} D5=${scores.D5} D7=${scores.D7} D8=${scores.D8} → ${weightedTotal}/${maxWeighted} (${pct}%)`,
    );

    // Quality floor: every dimension must score ≥ 2
    for (const dim of ['D2', 'D5', 'D7', 'D8']) {
      if (scores[dim] < 2) {
        fail(`rubric floor: [${name}] ${dim} scored ${scores[dim]} (minimum 2)`);
      }
    }
  }
}

// ── new skill scaffolder ────────────────────────────────────────────────────

async function scenarioNewSkillScaffolder() {
  section('new skill scaffolder - end-to-end');

  const dir = path.join(OUTPUT_DIR, 'new-skill');
  await fs.ensureDir(path.join(dir, '.claude'));
  await fs.writeFile(
    path.join(dir, 'CLAUDE.md'),
    '# Test\n\n## Active Skills\n- `/arch-audit`\n\n## Environment\nNode 22\n',
  );

  const CLI = path.resolve(__dirname, '../../src/index.js');
  const answers = JSON.stringify({
    name: 'deploy',
    description: 'Deploy the application to staging and run smoke tests.',
    model: 'haiku',
    userInvocable: true,
    effort: 'medium',
    usesPlaywright: false,
    stepCount: 3,
  });

  try {
    execFileSync('node', [CLI, 'new', 'skill', '--answers', answers], {
      cwd: dir,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (e) {
    fail('new skill command', e.stderr || e.message);
    return;
  }

  // Verify SKILL.md created
  const skillPath = path.join(dir, '.claude', 'skills', 'custom-deploy', 'SKILL.md');
  if (fs.existsSync(skillPath)) {
    pass('new skill: SKILL.md created');
  } else {
    fail('new skill: SKILL.md not created');
    return;
  }

  // Verify test-skill.js created
  const testPath = path.join(dir, '.claude', 'skills', 'custom-deploy', 'test-skill.js');
  if (fs.existsSync(testPath)) {
    pass('new skill: test-skill.js created');
  } else {
    fail('new skill: test-skill.js not created');
  }

  // Verify frontmatter
  const content = fs.readFileSync(skillPath, 'utf8');
  const hasFrontmatter = content.startsWith('---\n') && content.includes('\n---\n');
  if (hasFrontmatter) pass('new skill: valid frontmatter delimiters');
  else fail('new skill: missing frontmatter');

  if (content.includes('name: custom-deploy')) pass('new skill: name field correct');
  else fail('new skill: name field incorrect');

  if (content.includes('context: fork')) pass('new skill: context is fork');
  else fail('new skill: context not fork');

  if (content.includes('model: haiku')) pass('new skill: model field correct');
  else fail('new skill: model field incorrect');

  // Verify description under 250 chars
  const descMatch = content.match(/^description:\s*(.+)/m);
  if (descMatch && descMatch[1].length <= 250) pass('new skill: description under 250 chars');
  else fail('new skill: description over 250 chars or missing');

  // Verify step structure
  if (content.includes('## Step 1') && content.includes('## Step 3 - Produce report'))
    pass('new skill: step structure correct');
  else fail('new skill: step structure incorrect');

  // Verify CLAUDE.md registration
  const claudeMd = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
  if (claudeMd.includes('/custom-deploy')) pass('new skill: registered in CLAUDE.md');
  else fail('new skill: not registered in CLAUDE.md');

  // Verify custom- prefix was auto-applied (input was "deploy", output is "custom-deploy")
  if (fs.existsSync(path.join(dir, '.claude', 'skills', 'custom-deploy')))
    pass('new skill: custom- prefix auto-applied');
  else fail('new skill: custom- prefix not applied');

  // Test with Playwright answers
  const playwrightAnswers = JSON.stringify({
    name: 'visual-check',
    description: 'Run visual regression checks with Playwright screenshots.',
    model: 'opus',
    userInvocable: true,
    effort: 'high',
    usesPlaywright: true,
    allowedTools: 'mcp__playwright__browser_navigate, mcp__playwright__browser_take_screenshot',
    stepCount: 2,
  });

  try {
    execFileSync('node', [CLI, 'new', 'skill', '--answers', playwrightAnswers], {
      cwd: dir,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (e) {
    fail('new skill (playwright)', e.stderr || e.message);
    return;
  }

  const pwContent = fs.readFileSync(
    path.join(dir, '.claude', 'skills', 'custom-visual-check', 'SKILL.md'),
    'utf8',
  );
  if (pwContent.includes('allowed-tools:')) pass('new skill: Playwright allowed-tools present');
  else fail('new skill: Playwright allowed-tools missing');

  if (pwContent.includes('mcp__playwright__browser_navigate'))
    pass('new skill: Playwright tools listed');
  else fail('new skill: Playwright tools not listed');
}

// ── Scenario: Swift content assertions (every R1 finding = one assertion) ────

async function scenarioSwiftContentAssertions() {
  section('Swift content assertions - regression guard');
  const config = {
    ...BASE,
    projectName: 'swift-content-check',
    techStack: 'swift',
    testCommand: 'xcodebuild test -scheme MyApp',
    buildCommand: 'xcodebuild build -scheme MyApp',
    devCommand: '',
    installCommand: '',
    typeCheckCommand: '',
    hasApi: false,
    hasDatabase: false,
    hasFrontend: true,
    hasE2E: false,
    hasPrd: false,
    hasDesignSystem: true,
    designSystemName: 'Apple Human Interface Guidelines',
    e2eCommand: '',
    includePreCommit: false,
    includeGithub: false,
  };
  const dir = await scaffold('swift-content-check', 'm', config);

  // R1: no swift run for Xcode GUI app (devCommand='')
  assertNotContains(dir, 'CLAUDE.md', 'swift run', 'R1: no swift run in CLAUDE.md');
  assertNotContains(dir, 'CLAUDE.md', 'npm run dev', 'R1: no npm run dev in CLAUDE.md');
  assertContains(dir, 'CLAUDE.md', '# no install step', 'R1: native install comment');

  // R2: Phase 4 disabled, no "# not configured" in prose
  assertContains(
    dir,
    '.claude/rules/pipeline.md',
    'Phase 4 - UAT / E2E tests *(disabled)*',
    'R2: Phase 4 disabled heading',
  );
  // count "# not configured" - should only appear in bash blocks, not prose
  const pipelineContent = fs.readFileSync(path.join(dir, '.claude/rules/pipeline.md'), 'utf8');
  const notConfiguredInProse = pipelineContent
    .split('\n')
    .filter(
      (l) =>
        l.includes('# not configured') && !l.trim().startsWith('`') && !l.trim().startsWith('#'),
    );
  if (notConfiguredInProse.length === 0) {
    pass('R2: no "# not configured" in pipeline prose');
  } else {
    fail(
      'R2: "# not configured" found in pipeline prose',
      `${notConfiguredInProse.length} occurrences`,
    );
  }

  // R3: dependency-scan no contradictory "true is false"
  assertNotContains(
    dir,
    '.claude/skills/dependency-scan/SKILL.md',
    'true is false',
    'R3: no "true is false"',
  );
  assertNotContains(
    dir,
    '.claude/skills/dependency-scan/SKILL.md',
    '`true`; skip when `false`',
    'R3: no interpolated contradiction',
  );

  // R4: .gitignore has Swift patterns
  assertContains(dir, '.gitignore', 'xcuserdata/', 'R4: .gitignore xcuserdata');
  assertContains(dir, '.gitignore', 'DerivedData/', 'R4: .gitignore DerivedData');
  assertContains(dir, '.gitignore', '.build/', 'R4: .gitignore .build');

  // R5: FIRST_SESSION no Playwright for native
  assertNotContains(
    dir,
    '.claude/FIRST_SESSION.md',
    'Playwright/Cypress',
    'R5: no Playwright in FIRST_SESSION',
  );
  assertContains(dir, '.claude/FIRST_SESSION.md', 'XCUITest', 'R5: XCUITest in FIRST_SESSION');

  // R6: every cheatsheet skill row has a corresponding skill directory
  assertCheatsheetSkillsHaveDirs(dir, 'R6');

  // R7: no staff-manager anywhere
  assertNoBannedPattern(dir, 'staff-manager', 'R7: zero staff-manager in all files');

  // R8: CLAUDE.md Environment is native
  assertContains(
    dir,
    'CLAUDE.md',
    'native (DMG / TestFlight / App Store)',
    'R8: native distribution',
  );
  assertNotContains(dir, 'CLAUDE.md', '.env.local', 'R8: no .env.local in CLAUDE.md');
  assertNotContains(dir, 'CLAUDE.md', 'staging URL', 'R8: no staging URL');

  // R9: CLAUDE.md no web Tech Stack lines
  assertNotContains(dir, 'CLAUDE.md', '**Database**:', 'R9: no Database line');
  assertNotContains(dir, 'CLAUDE.md', '**Auth**:', 'R9: no Auth line');
  assertNotContains(dir, 'CLAUDE.md', '**Storage**:', 'R9: no Storage line');
  assertNotContains(dir, 'CLAUDE.md', '**Email**:', 'R9: no Email line');
  assertContains(dir, 'CLAUDE.md', '_native distribution_', 'R9: native deploy');

  // R10: design system injected
  assertContains(
    dir,
    'CLAUDE.md',
    'Apple Human Interface Guidelines',
    'R10: HIG in Coding Conventions',
  );
  assertContains(dir, 'CLAUDE.md', 'Design guideline', 'R10: Design guideline label');
}

// ── Scenario: Node-TS content assertions ──────────────────────────────────────

async function scenarioNodeTsContentAssertions() {
  section('Node-TS content assertions - regression guard');
  const config = {
    ...BASE,
    tier: 'm',
    projectName: 'node-ts-content-check',
    techStack: 'node-ts',
    framework: 'Next.js 15',
    testCommand: 'npx vitest run',
    buildCommand: 'npm run build',
    devCommand: 'npm run dev',
    installCommand: 'npm install',
    typeCheckCommand: 'npx tsc --noEmit',
    hasApi: true,
    hasDatabase: true,
    hasFrontend: true,
    hasE2E: false,
    hasPrd: false,
    hasDesignSystem: true,
    designSystemName: 'shadcn/ui',
    e2eCommand: '',
    includePreCommit: true,
    includeGithub: true,
  };
  const dir = await scaffold('node-ts-content-check', 'm', config);

  // NT1: npm commands present in CLAUDE.md
  assertContains(dir, 'CLAUDE.md', 'npm install', 'NT1: npm install in CLAUDE.md');
  assertContains(dir, 'CLAUDE.md', 'npm run build', 'NT1: npm run build in CLAUDE.md');
  assertContains(dir, 'CLAUDE.md', 'npm run dev', 'NT1: npm run dev in CLAUDE.md');
  assertContains(dir, 'CLAUDE.md', 'npx vitest run', 'NT1: npx vitest run in CLAUDE.md');

  // NT2: TypeScript type check
  assertContains(dir, 'CLAUDE.md', 'npx tsc --noEmit', 'NT2: tsc type check in CLAUDE.md');

  // NT3: language and framework labels
  assertContains(dir, 'CLAUDE.md', '**Language**: TypeScript', 'NT3: Language label');
  assertContains(dir, 'CLAUDE.md', '**Framework**: Next.js 15', 'NT3: Framework label');

  // NT4: web Environment section (not native)
  assertContains(dir, 'CLAUDE.md', '.env.local', 'NT4: .env.local in Environment');
  assertNotContains(dir, 'CLAUDE.md', '_native distribution_', 'NT4: no native distribution');
  assertNotContains(dir, 'CLAUDE.md', 'DMG / TestFlight', 'NT4: no DMG/TestFlight');

  // NT5: web Tech Stack lines present
  assertContains(dir, 'CLAUDE.md', '**Database**:', 'NT5: Database line present');

  // NT6: no native .gitignore patterns
  assertNotContains(dir, '.gitignore', 'xcuserdata/', 'NT6: no xcuserdata in .gitignore');
  assertNotContains(dir, '.gitignore', 'DerivedData/', 'NT6: no DerivedData in .gitignore');
  assertNotContains(dir, '.gitignore', '.build/', 'NT6: no .build in .gitignore');

  // NT7: FIRST_SESSION mentions Playwright/Cypress for web, not XCUITest
  assertContains(
    dir,
    '.claude/FIRST_SESSION.md',
    'Playwright/Cypress',
    'NT7: Playwright in FIRST_SESSION',
  );
  assertNotContains(
    dir,
    '.claude/FIRST_SESSION.md',
    'XCUITest',
    'NT7: no XCUITest in FIRST_SESSION',
  );

  // NT8: design system injected
  assertContains(dir, 'CLAUDE.md', 'shadcn/ui', 'NT8: shadcn/ui in CLAUDE.md');
  assertContains(dir, 'CLAUDE.md', 'Design guideline', 'NT8: Design guideline label');

  // NT9: API convention line present
  assertContains(dir, 'CLAUDE.md', 'Every API route', 'NT9: API convention line');

  // NT10: cheatsheet parity + no banned patterns
  assertCheatsheetSkillsHaveDirs(dir, 'NT10');
  assertNoBannedPattern(dir, 'staff-manager', 'NT10: no staff-manager');
}

// ── Scenario: Python content assertions ───────────────────────────────────────

async function scenarioPythonContentAssertions() {
  section('Python content assertions - regression guard');
  const config = {
    ...BASE,
    tier: 'm',
    projectName: 'python-content-check',
    techStack: 'python',
    framework: 'FastAPI',
    testCommand: 'pytest',
    buildCommand: 'python -m build',
    devCommand: 'uvicorn app:app --reload',
    installCommand: 'pip install -r requirements.txt',
    typeCheckCommand: 'mypy .',
    hasApi: true,
    hasDatabase: true,
    hasFrontend: false,
    hasE2E: false,
    hasPrd: false,
    hasDesignSystem: false,
    designSystemName: '',
    e2eCommand: '',
    includePreCommit: true,
    includeGithub: true,
  };
  const dir = await scaffold('python-content-check', 'm', config);

  // PY1: Python commands in CLAUDE.md
  assertContains(dir, 'CLAUDE.md', 'pytest', 'PY1: pytest in CLAUDE.md');
  assertContains(dir, 'CLAUDE.md', 'pip install', 'PY1: pip install in CLAUDE.md');
  assertContains(dir, 'CLAUDE.md', 'uvicorn', 'PY1: uvicorn in CLAUDE.md');
  assertContains(dir, 'CLAUDE.md', 'mypy', 'PY1: mypy in CLAUDE.md');

  // PY2: no npm in CLAUDE.md (Python stack, no Node.js)
  assertNotContains(dir, 'CLAUDE.md', 'npm', 'PY2: no npm in CLAUDE.md');
  assertNotContains(dir, 'CLAUDE.md', 'npx', 'PY2: no npx in CLAUDE.md');

  // PY3: language and framework labels
  assertContains(dir, 'CLAUDE.md', '**Language**: Python', 'PY3: Language label');
  assertContains(dir, 'CLAUDE.md', '**Framework**: FastAPI', 'PY3: Framework label');

  // PY4: web Environment (not native) - Python is web stack
  assertContains(dir, 'CLAUDE.md', '.env.local', 'PY4: .env.local in Environment');
  assertNotContains(dir, 'CLAUDE.md', '_native distribution_', 'PY4: no native distribution');

  // PY5: Database line present (hasDatabase=true)
  assertContains(dir, 'CLAUDE.md', '**Database**:', 'PY5: Database line present');

  // PY6: no native .gitignore sections
  assertNotContains(dir, '.gitignore', 'xcuserdata/', 'PY6: no xcuserdata in .gitignore');
  assertNotContains(dir, '.gitignore', 'DerivedData/', 'PY6: no DerivedData in .gitignore');

  // PY7: base .gitignore already has Python patterns
  assertContains(dir, '.gitignore', '__pycache__/', 'PY7: __pycache__ in .gitignore');
  assertContains(dir, '.gitignore', '.venv/', 'PY7: .venv in .gitignore');

  // PY8: hasFrontend=false - frontend skills pruned
  const frontendSkills = ['responsive-audit', 'visual-audit', 'ux-audit', 'accessibility-audit'];
  for (const skill of frontendSkills) {
    const skillDir = path.join(dir, '.claude', 'skills', skill);
    if (!fs.existsSync(skillDir)) {
      pass(`PY8: ${skill} pruned (no frontend)`);
    } else {
      fail(`PY8: ${skill} should be pruned (hasFrontend=false)`, 'dir still exists');
    }
  }

  // PY9: API convention line present (hasApi=true)
  assertContains(dir, 'CLAUDE.md', 'Every API route', 'PY9: API convention line');

  // PY10: no "Every API route" stripped (hasApi is true)
  // no design system (hasDesignSystem=false)
  assertNotContains(dir, 'CLAUDE.md', 'Design guideline', 'PY10: no design system injected');

  // PY11: cheatsheet parity + no banned patterns
  assertCheatsheetSkillsHaveDirs(dir, 'PY11');
  assertNoBannedPattern(dir, 'staff-manager', 'PY11: no staff-manager');
}

// ── Scenario: Cross-stack content invariants ─────────────────────────────────

async function scenarioCrossStackInvariants() {
  section('Cross-stack content invariants');

  const NATIVE_STACKS = ['swift', 'kotlin', 'rust', 'dotnet', 'java'];
  const WEB_STACKS = ['node-ts', 'node-js', 'python', 'ruby', 'go'];
  const ALL_STACKS = [...NATIVE_STACKS, ...WEB_STACKS];

  for (const stack of ALL_STACKS) {
    const isNative = NATIVE_STACKS.includes(stack);
    const config = {
      ...BASE,
      projectName: `cross-${stack}`,
      techStack: stack,
      // Native stacks must not inherit npm commands from BASE
      testCommand: isNative ? '' : 'npx vitest run',
      buildCommand: isNative ? '' : 'npm run build',
      devCommand: isNative ? '' : 'npm run dev',
      installCommand: '',
      typeCheckCommand: stack === 'node-ts' ? 'npx tsc --noEmit' : '',
      hasApi: !isNative,
      hasDatabase: !isNative,
      hasFrontend: true,
      hasE2E: false,
      hasPrd: false,
      hasDesignSystem: false,
      designSystemName: 'component library',
      e2eCommand: '',
      includePreCommit: false,
      includeGithub: false,
    };
    const dir = await scaffold(`cross-stack-${stack}`, 'm', config);

    // INV-1: no web artifacts in native stacks
    if (isNative) {
      assertNotContains(dir, 'CLAUDE.md', 'npm', `${stack}: no npm in CLAUDE.md`);
      assertNotContains(dir, 'CLAUDE.md', '.env.local', `${stack}: no .env.local in CLAUDE.md`);
      assertContains(dir, 'CLAUDE.md', '_native distribution_', `${stack}: native deploy`);
    }

    // INV-2: no native artifacts in web stacks
    if (!isNative) {
      assertNotContains(dir, '.gitignore', 'xcuserdata/', `${stack}: no xcuserdata in .gitignore`);
      assertNotContains(
        dir,
        '.gitignore',
        'DerivedData/',
        `${stack}: no DerivedData in .gitignore`,
      );
    }

    // INV-3: native stacks have stack-specific .gitignore section
    if (isNative) {
      const gitignoreContent = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8');
      const hasStackSection = {
        swift: 'xcuserdata/',
        kotlin: '.gradle/',
        rust: 'target/',
        dotnet: 'bin/',
        java: 'target/',
      };
      if (gitignoreContent.includes(hasStackSection[stack])) {
        pass(`${stack}: stack-specific .gitignore pattern`);
      } else {
        fail(`${stack}: missing stack-specific .gitignore pattern`, hasStackSection[stack]);
      }
    }

    // INV-4: every cheatsheet skill has a corresponding dir
    assertCheatsheetSkillsHaveDirs(dir, stack);

    // INV-5: zero staff-manager contamination
    assertNoBannedPattern(dir, 'staff-manager', `${stack}: no staff-manager`);

    // INV-6: wizard placeholders resolved
    assertNoUnfilledWizardPlaceholders(dir);
  }
}

async function scenarioSkillMdSpecCompliance() {
  section('SKILL.md Anthropic spec compliance (size + allowed-tools syntax)');

  for (const tier of ['s', 'm', 'l']) {
    const config = {
      ...BASE,
      tier,
      isDiscovery: false,
      hasFrontend: true,
      hasApi: true,
      hasDatabase: true,
    };
    const scenarioDir = path.join(OUTPUT_DIR, `spec-compliance-tier-${tier}`);
    await fs.ensureDir(scenarioDir);
    await scaffoldTier(tier, scenarioDir, config, TEMPLATES_DIR);

    const skillsDir = path.join(scenarioDir, '.claude/skills');
    if (!fs.existsSync(skillsDir)) {
      pass(`Tier ${tier}: no .claude/skills (nothing to validate)`);
      continue;
    }

    const skillDirs = fs
      .readdirSync(skillsDir)
      .filter((name) => fs.statSync(path.join(skillsDir, name)).isDirectory());

    const tierOversize = [];
    const tierCommas = [];

    for (const skill of skillDirs) {
      const skillFile = path.join(skillsDir, skill, 'SKILL.md');
      if (!fs.existsSync(skillFile)) continue;
      const raw = fs.readFileSync(skillFile, 'utf8');
      const { body, fields, frontmatter } = parseSkillFile(raw);

      if (frontmatter === null) {
        fail(`Tier ${tier}: ${skill}/SKILL.md missing YAML frontmatter`);
        continue;
      }

      const lines = countBodyLines(body);
      if (lines > SKILL_MD_MAX_LINES) {
        tierOversize.push(`${skill} (${lines} lines)`);
      }

      if (allowedToolsHasCommas(fields.allowedTools)) {
        tierCommas.push(skill);
      }
    }

    if (tierOversize.length === 0) {
      pass(`Tier ${tier}: all ${skillDirs.length} SKILL.md bodies ≤ ${SKILL_MD_MAX_LINES} lines`);
    } else {
      fail(
        `Tier ${tier}: SKILL.md bodies over ${SKILL_MD_MAX_LINES} lines: ${tierOversize.join(', ')}`,
      );
    }

    if (tierCommas.length === 0) {
      pass(`Tier ${tier}: all allowed-tools values use space-separated syntax`);
    } else {
      fail(`Tier ${tier}: allowed-tools uses comma syntax (not spec): ${tierCommas.join(', ')}`);
    }
  }
}

async function scenarioDoctorCrossFileValidation() {
  section('Doctor cross-file validation (v1.12.0 new checks)');

  const CLI = path.resolve(__dirname, '../../src/index.js');
  const NEW_CHECK_IDS = [
    'settings-no-placeholders',
    'claudemd-stop-hook-test-cmd-match',
    'claudemd-skills-directory-parity',
    'pipeline-md-tier-coherence',
    'security-md-stack-alignment',
  ];

  function injectStackMarker(dir, stack) {
    if (stack === 'node-ts') {
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        '{"name":"test","devDependencies":{"typescript":"5.0.0"}}',
      );
      fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{}');
    } else if (stack === 'swift') {
      fs.writeFileSync(path.join(dir, 'Package.swift'), '// swift-tools-version:5.9\n');
    }
  }

  function fillStopHookTestCmd(dir) {
    const settingsPath = path.join(dir, '.claude/settings.json');
    const raw = fs.readFileSync(settingsPath, 'utf8');
    fs.writeFileSync(settingsPath, raw.replace(/\[TEST_COMMAND\]/g, 'npx vitest run'));
  }

  function fillClaudeMdTestCmd(dir) {
    const claudePath = path.join(dir, 'CLAUDE.md');
    const raw = fs.readFileSync(claudePath, 'utf8');
    fs.writeFileSync(claudePath, raw.replace(/\[TEST_COMMAND\]/g, 'npx vitest run'));
  }

  function runDoctor(dir) {
    try {
      const output = execFileSync('node', [CLI, 'doctor', '--report'], {
        cwd: dir,
        encoding: 'utf8',
      });
      return JSON.parse(output);
    } catch (e) {
      const raw = (e.stdout || '').toString();
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
  }

  function getCheckStatus(report, id) {
    return report?.checks?.find((c) => c.id === id)?.status;
  }

  for (const tier of ['s', 'm', 'l']) {
    const config = {
      ...BASE,
      tier,
      isDiscovery: false,
      hasFrontend: true,
      hasApi: true,
      hasDatabase: true,
    };

    // Positive test: scaffold pulito + stack marker + placeholder risolti
    const cleanDir = await scaffold(`doctor-xfile-clean-tier-${tier}`, tier, config);
    injectStackMarker(cleanDir, 'node-ts');
    fillStopHookTestCmd(cleanDir);
    fillClaudeMdTestCmd(cleanDir);
    const cleanReport = runDoctor(cleanDir);
    if (!cleanReport) {
      fail(`Tier ${tier}: doctor --report did not emit valid JSON on clean scaffold`);
      continue;
    }
    for (const id of NEW_CHECK_IDS) {
      const status = getCheckStatus(cleanReport, id);
      if (status === 'pass' || status === 'skip') {
        pass(`Tier ${tier} clean: ${id} = ${status}`);
      } else {
        fail(`Tier ${tier} clean: ${id} = ${status} (expected pass or skip)`);
      }
    }

    // Corruption: re-inject [TEST_COMMAND] placeholder into settings.json after scaffold filled it
    const corruptPlaceholder = await scaffold(
      `doctor-xfile-corrupt-placeholder-tier-${tier}`,
      tier,
      config,
    );
    injectStackMarker(corruptPlaceholder, 'node-ts');
    fillClaudeMdTestCmd(corruptPlaceholder);
    const placeholderSettingsPath = path.join(corruptPlaceholder, '.claude/settings.json');
    const placeholderSettings = JSON.parse(fs.readFileSync(placeholderSettingsPath, 'utf8'));
    if (placeholderSettings?.hooks?.Stop?.[0]?.hooks?.[0]) {
      placeholderSettings.hooks.Stop[0].hooks[0].command =
        '[ "$stop_hook_active" = "1" ] && exit 0; [TEST_COMMAND] || echo blocked';
      fs.writeFileSync(placeholderSettingsPath, JSON.stringify(placeholderSettings, null, 2));
    }
    const placeholderReport = runDoctor(corruptPlaceholder);
    const placeholderStatus = getCheckStatus(placeholderReport, 'settings-no-placeholders');
    if (placeholderStatus === 'warn' || placeholderStatus === 'fail') {
      pass(`Tier ${tier} corrupt-placeholder: settings-no-placeholders = ${placeholderStatus}`);
    } else {
      fail(`Tier ${tier} corrupt-placeholder: expected warn/fail, got ${placeholderStatus}`);
    }

    // Corruption: overwrite Stop hook command directly to a different test cmd than CLAUDE.md
    const corruptCmdMismatch = await scaffold(
      `doctor-xfile-corrupt-cmd-tier-${tier}`,
      tier,
      config,
    );
    injectStackMarker(corruptCmdMismatch, 'node-ts');
    fillClaudeMdTestCmd(corruptCmdMismatch);
    const mismatchSettingsPath = path.join(corruptCmdMismatch, '.claude/settings.json');
    const mismatchSettings = JSON.parse(fs.readFileSync(mismatchSettingsPath, 'utf8'));
    if (mismatchSettings?.hooks?.Stop?.[0]?.hooks?.[0]) {
      mismatchSettings.hooks.Stop[0].hooks[0].command =
        '[ "$stop_hook_active" = "1" ] && exit 0; npx jest || echo blocked';
      fs.writeFileSync(mismatchSettingsPath, JSON.stringify(mismatchSettings, null, 2));
    }
    const cmdReport = runDoctor(corruptCmdMismatch);
    const cmdStatus = getCheckStatus(cmdReport, 'claudemd-stop-hook-test-cmd-match');
    if (cmdStatus === 'warn' || cmdStatus === 'fail') {
      pass(`Tier ${tier} corrupt-cmd-mismatch: claudemd-stop-hook-test-cmd-match = ${cmdStatus}`);
    } else {
      fail(`Tier ${tier} corrupt-cmd-mismatch: expected warn/fail, got ${cmdStatus}`);
    }

    // Corruption: remove a skill directory
    const corruptSkillMissing = await scaffold(
      `doctor-xfile-corrupt-skill-tier-${tier}`,
      tier,
      config,
    );
    injectStackMarker(corruptSkillMissing, 'node-ts');
    fillStopHookTestCmd(corruptSkillMissing);
    fillClaudeMdTestCmd(corruptSkillMissing);
    const archSkillDir = path.join(corruptSkillMissing, '.claude/skills/arch-audit');
    if (fs.existsSync(archSkillDir)) fs.rmSync(archSkillDir, { recursive: true, force: true });
    const skillReport = runDoctor(corruptSkillMissing);
    const skillStatus = getCheckStatus(skillReport, 'claudemd-skills-directory-parity');
    if (skillStatus === 'warn' || skillStatus === 'fail') {
      pass(`Tier ${tier} corrupt-skill-missing: claudemd-skills-directory-parity = ${skillStatus}`);
    } else {
      fail(`Tier ${tier} corrupt-skill-missing: expected warn/fail, got ${skillStatus}`);
    }

    // Corruption: pipeline.md H1 with a wrong tier name
    const corruptTier = await scaffold(`doctor-xfile-corrupt-tier-${tier}`, tier, config);
    injectStackMarker(corruptTier, 'node-ts');
    fillStopHookTestCmd(corruptTier);
    fillClaudeMdTestCmd(corruptTier);
    const pipelinePath = path.join(corruptTier, '.claude/rules/pipeline.md');
    try {
      const raw = fs.readFileSync(pipelinePath, 'utf8');
      const wrongH1 =
        tier === 's' ? '# Full Development Pipeline - Tier L\n' : '# Fast Lane Pipeline\n';
      fs.writeFileSync(pipelinePath, raw.replace(/^#[^\n]*\n/, wrongH1));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    const tierReport = runDoctor(corruptTier);
    const tierStatus = getCheckStatus(tierReport, 'pipeline-md-tier-coherence');
    if (tierStatus === 'warn' || tierStatus === 'fail') {
      pass(`Tier ${tier} corrupt-tier-h1: pipeline-md-tier-coherence = ${tierStatus}`);
    } else {
      fail(`Tier ${tier} corrupt-tier-h1: expected warn/fail, got ${tierStatus}`);
    }

    // Corruption: node-ts marker but security.md overwritten with the Apple variant
    const corruptSecurity = await scaffold(`doctor-xfile-corrupt-sec-tier-${tier}`, tier, config);
    injectStackMarker(corruptSecurity, 'node-ts');
    fillStopHookTestCmd(corruptSecurity);
    fillClaudeMdTestCmd(corruptSecurity);
    const securityPath = path.join(corruptSecurity, '.claude/rules/security.md');
    fs.writeFileSync(
      securityPath,
      '# Security Rules - Native Apple (macOS / iOS)\n\nStore secrets in Keychain only.\n',
    );
    const secReport = runDoctor(corruptSecurity);
    const secStatus = getCheckStatus(secReport, 'security-md-stack-alignment');
    if (secStatus === 'warn' || secStatus === 'fail') {
      pass(`Tier ${tier} corrupt-security: security-md-stack-alignment = ${secStatus}`);
    } else {
      fail(`Tier ${tier} corrupt-security: expected warn/fail, got ${secStatus}`);
    }
  }
}

async function scenarioDocAuditPresent() {
  section('doc-audit skill presence + tier pruning (v1.13.0)');

  for (const tier of ['s', 'm', 'l']) {
    const config = { ...BASE, tier, isDiscovery: false };
    const dir = await scaffold(`doc-audit-tier-${tier}`, tier, config);
    const skillDir = path.join(dir, '.claude/skills/doc-audit');
    const shouldExist = tier === 'm' || tier === 'l';

    if (shouldExist) {
      if (fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
        pass(`Tier ${tier}: doc-audit/SKILL.md scaffolded`);
      } else {
        fail(`Tier ${tier}: doc-audit/SKILL.md missing`);
      }
      if (fs.existsSync(path.join(skillDir, 'PATTERNS.md'))) {
        pass(`Tier ${tier}: doc-audit/PATTERNS.md scaffolded`);
      } else {
        fail(`Tier ${tier}: doc-audit/PATTERNS.md missing`);
      }

      const cheatsheetPath = path.join(dir, '.claude/cheatsheet.md');
      if (fs.existsSync(cheatsheetPath)) {
        const cheatsheet = fs.readFileSync(cheatsheetPath, 'utf8');
        if (/`\/doc-audit`/.test(cheatsheet)) {
          pass(`Tier ${tier}: cheatsheet row for /doc-audit present`);
        } else {
          fail(`Tier ${tier}: cheatsheet row for /doc-audit missing`);
        }
      } else {
        fail(`Tier ${tier}: .claude/cheatsheet.md missing`);
      }

      const pipelinePath = path.join(dir, '.claude/rules/pipeline.md');
      if (fs.existsSync(pipelinePath)) {
        const pipeline = fs.readFileSync(pipelinePath, 'utf8');
        if (/\/doc-audit/.test(pipeline)) {
          pass(`Tier ${tier}: pipeline.md Track C references /doc-audit`);
        } else {
          fail(`Tier ${tier}: pipeline.md Track C missing /doc-audit invocation`);
        }
        if (/Track C - Test \+ doc( \+ infra)? audit/.test(pipeline)) {
          pass(`Tier ${tier}: pipeline.md Track C header includes doc audit pairing`);
        } else {
          fail(`Tier ${tier}: pipeline.md Track C header not renamed`);
        }
      } else {
        fail(`Tier ${tier}: .claude/rules/pipeline.md missing`);
      }

      const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
      const parsed = parseSkillFile(skillMd);
      if (parsed.fields.allowedTools && !allowedToolsHasCommas(parsed.fields.allowedTools)) {
        pass(`Tier ${tier}: doc-audit allowed-tools is space-separated`);
      } else {
        fail(`Tier ${tier}: doc-audit allowed-tools uses commas or missing`);
      }
      const bodyLines = countBodyLines(parsed.body);
      if (bodyLines <= SKILL_MD_MAX_LINES) {
        pass(`Tier ${tier}: doc-audit body ${bodyLines} lines (<= ${SKILL_MD_MAX_LINES})`);
      } else {
        fail(
          `Tier ${tier}: doc-audit body ${bodyLines} lines exceeds ${SKILL_MD_MAX_LINES} budget`,
        );
      }
    } else {
      if (!fs.existsSync(skillDir)) {
        pass(`Tier ${tier}: doc-audit pruned (not installed on tier S)`);
      } else {
        fail(`Tier ${tier}: doc-audit present but should be pruned`);
      }

      const cheatsheetPath = path.join(dir, '.claude/cheatsheet.md');
      if (fs.existsSync(cheatsheetPath)) {
        const cheatsheet = fs.readFileSync(cheatsheetPath, 'utf8');
        if (!/\/doc-audit/.test(cheatsheet)) {
          pass(`Tier ${tier}: cheatsheet row for /doc-audit pruned`);
        } else {
          fail(`Tier ${tier}: cheatsheet still references /doc-audit`);
        }
      }
    }
  }
}

async function assertSkillPresent(dir, tier, skillName, opts = {}) {
  const { siblings = [], pipelineRegex, cheatsheetRegex } = opts;
  const skillDir = path.join(dir, `.claude/skills/${skillName}`);

  if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
    fail(`Tier ${tier}: ${skillName}/SKILL.md missing`);
    return;
  }
  pass(`Tier ${tier}: ${skillName}/SKILL.md scaffolded`);

  for (const sib of siblings) {
    if (fs.existsSync(path.join(skillDir, sib))) {
      pass(`Tier ${tier}: ${skillName}/${sib} scaffolded`);
    } else {
      fail(`Tier ${tier}: ${skillName}/${sib} missing`);
    }
  }

  const cheatsheetPath = path.join(dir, '.claude/cheatsheet.md');
  if (fs.existsSync(cheatsheetPath)) {
    const cheatsheet = fs.readFileSync(cheatsheetPath, 'utf8');
    if ((cheatsheetRegex || new RegExp(`\`/${skillName}\``)).test(cheatsheet)) {
      pass(`Tier ${tier}: cheatsheet row for /${skillName} present`);
    } else {
      fail(`Tier ${tier}: cheatsheet row for /${skillName} missing`);
    }
  } else {
    fail(`Tier ${tier}: .claude/cheatsheet.md missing`);
  }

  const pipelinePath = path.join(dir, '.claude/rules/pipeline.md');
  if (fs.existsSync(pipelinePath)) {
    const pipeline = fs.readFileSync(pipelinePath, 'utf8');
    if ((pipelineRegex || new RegExp(`/${skillName}`)).test(pipeline)) {
      pass(`Tier ${tier}: pipeline.md references /${skillName}`);
    } else {
      fail(`Tier ${tier}: pipeline.md missing /${skillName} invocation`);
    }
  }

  const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
  const parsed = parseSkillFile(skillMd);
  if (parsed.fields.allowedTools && !allowedToolsHasCommas(parsed.fields.allowedTools)) {
    pass(`Tier ${tier}: ${skillName} allowed-tools is space-separated`);
  } else {
    fail(`Tier ${tier}: ${skillName} allowed-tools uses commas or missing`);
  }
  const bodyLines = countBodyLines(parsed.body);
  if (bodyLines <= SKILL_MD_MAX_LINES) {
    pass(`Tier ${tier}: ${skillName} body ${bodyLines} lines (<= ${SKILL_MD_MAX_LINES})`);
  } else {
    fail(`Tier ${tier}: ${skillName} body ${bodyLines} lines exceeds ${SKILL_MD_MAX_LINES} budget`);
  }
}

async function scenarioApiContractAuditPresent() {
  section('api-contract-audit skill presence + tier/flag pruning (v1.14.0)');

  for (const tier of ['s', 'm', 'l']) {
    const config = { ...BASE, tier, isDiscovery: false };
    const dir = await scaffold(`api-contract-audit-tier-${tier}`, tier, config);
    const skillDir = path.join(dir, '.claude/skills/api-contract-audit');
    const shouldExist = tier === 'm' || tier === 'l';

    if (shouldExist) {
      await assertSkillPresent(dir, tier, 'api-contract-audit', { siblings: ['PATTERNS.md'] });
    } else {
      if (!fs.existsSync(skillDir)) {
        pass(`Tier ${tier}: api-contract-audit pruned (not on tier S)`);
      } else {
        fail(`Tier ${tier}: api-contract-audit present but should be pruned`);
      }
    }
  }

  // hasApi=false: api-contract-audit must be pruned even on tier M/L
  const noApiConfig = { ...BASE, tier: 'm', isDiscovery: false, hasApi: false };
  const noApiDir = await scaffold('api-contract-audit-no-api', 'm', noApiConfig);
  if (!fs.existsSync(path.join(noApiDir, '.claude/skills/api-contract-audit'))) {
    pass('Tier M + hasApi=false: api-contract-audit pruned');
  } else {
    fail('Tier M + hasApi=false: api-contract-audit should be pruned');
  }
  const noApiCheatsheet = fs.readFileSync(path.join(noApiDir, '.claude/cheatsheet.md'), 'utf8');
  if (!/\/api-contract-audit/.test(noApiCheatsheet)) {
    pass('Tier M + hasApi=false: cheatsheet row for /api-contract-audit pruned');
  } else {
    fail('Tier M + hasApi=false: cheatsheet still references /api-contract-audit');
  }
}

async function scenarioInfraAuditPresent() {
  section('infra-audit skill presence + tier pruning (v1.14.0)');

  for (const tier of ['s', 'm', 'l']) {
    const config = { ...BASE, tier, isDiscovery: false };
    const dir = await scaffold(`infra-audit-tier-${tier}`, tier, config);
    const skillDir = path.join(dir, '.claude/skills/infra-audit');
    const shouldExist = tier === 'm' || tier === 'l';

    if (shouldExist) {
      await assertSkillPresent(dir, tier, 'infra-audit', { siblings: ['PATTERNS.md'] });
    } else {
      if (!fs.existsSync(skillDir)) {
        pass(`Tier ${tier}: infra-audit pruned (not on tier S)`);
      } else {
        fail(`Tier ${tier}: infra-audit present but should be pruned`);
      }
    }
  }
}

async function scenarioSkillDevHotspot() {
  section('skill-dev v2 hotspot priority (churn × debt) — content assertions (v1.22.0)');

  for (const tier of ['s', 'm', 'l']) {
    const config = { ...BASE, tier, isDiscovery: false };
    const dir = await scaffold(`skill-dev-hotspot-tier-${tier}`, tier, config);
    const skillPath = path.join(dir, '.claude/skills/skill-dev/SKILL.md');
    if (!fs.existsSync(skillPath)) {
      fail(`Tier ${tier}: skill-dev SKILL.md missing`);
      continue;
    }
    const body = fs.readFileSync(skillPath, 'utf8');

    if (/## Step 3b - Hotspot priority/.test(body)) {
      pass(`Tier ${tier}: skill-dev declares Step 3b — Hotspot priority`);
    } else {
      fail(`Tier ${tier}: skill-dev missing Step 3b`);
    }

    if (/git log --since="6\.months\.ago" --numstat/.test(body)) {
      pass(`Tier ${tier}: skill-dev Step 3b uses git log churn signal`);
    } else {
      fail(`Tier ${tier}: skill-dev Step 3b missing git log churn command`);
    }

    if (
      /Q1 — Hot mess/.test(body) &&
      /Q2 — Stable rot/.test(body) &&
      /Q3 — Flaky frontier/.test(body) &&
      /Q4 — Cold corner/.test(body)
    ) {
      pass(`Tier ${tier}: skill-dev Step 3b documents 4-quadrant priority matrix`);
    } else {
      fail(`Tier ${tier}: skill-dev Step 3b missing one or more priority quadrants`);
    }

    if (/### Hotspot priority \(churn × debt\) — top 10/.test(body)) {
      pass(`Tier ${tier}: skill-dev report includes Hotspot priority section`);
    } else {
      fail(`Tier ${tier}: skill-dev report missing Hotspot priority section`);
    }

    if (/Hotspot table skipped: insufficient signal/.test(body)) {
      pass(`Tier ${tier}: skill-dev documents fallback when not a Git repo / low signal`);
    } else {
      fail(`Tier ${tier}: skill-dev missing Hotspot fallback wording`);
    }
  }
}

async function scenarioRuntimeEnforcementHook() {
  section('team-settings runtime enforcement hook (v1.21.0)');

  const HOOK_PATH = path.resolve(
    __dirname,
    '../../templates/common/.claude/hooks/team-settings-enforcement.mjs',
  );

  function invokeHook(cwd, payload) {
    try {
      const out = execFileSync('node', [HOOK_PATH], {
        cwd,
        encoding: 'utf8',
        input: JSON.stringify(payload),
        env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
      });
      return { code: 0, out };
    } catch (e) {
      return { code: e.status || 1, out: (e.stdout || '').toString() };
    }
  }

  for (const tier of ['s', 'm', 'l']) {
    const config = { ...BASE, tier, isDiscovery: false };
    const dir = await scaffold(`runtime-enforcement-tier-${tier}`, tier, config);

    const hookFile = path.join(dir, '.claude/hooks/team-settings-enforcement.mjs');
    if (fs.existsSync(hookFile)) {
      pass(`Tier ${tier}: hook script scaffolded at .claude/hooks/team-settings-enforcement.mjs`);
    } else {
      fail(`Tier ${tier}: hook script missing`);
      continue;
    }

    const settings = JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'));
    const preToolUse = settings?.hooks?.PreToolUse || [];
    const skillMatcher = preToolUse.find((e) => e.matcher === 'Skill');
    if (skillMatcher?.hooks?.some((h) => /team-settings-enforcement\.mjs/.test(h.command || ''))) {
      pass(`Tier ${tier}: settings.json registers PreToolUse Skill matcher with hook command`);
    } else {
      fail(`Tier ${tier}: settings.json does not register the runtime enforcement hook`);
    }
  }

  // Behavior tests against the hook script directly.
  const dir = await scaffold('runtime-enforcement-behavior', 'm', {
    ...BASE,
    tier: 'm',
    isDiscovery: false,
  });

  // No team-settings.json → allow (exit 0, no output)
  {
    const r = invokeHook(dir, {
      tool_name: 'Skill',
      tool_input: { skill_name: 'security-audit' },
    });
    if (r.code === 0 && r.out.trim() === '') {
      pass('No team-settings.json: hook allows silently');
    } else {
      fail(`No team-settings.json: hook returned code=${r.code} out=${r.out.slice(0, 100)}`);
    }
  }

  // blockedSkills hits → deny JSON
  fs.writeFileSync(
    path.join(dir, '.claude/team-settings.json'),
    JSON.stringify({ blockedSkills: ['security-audit'] }, null, 2),
  );
  {
    const r = invokeHook(dir, {
      tool_name: 'Skill',
      tool_input: { skill_name: 'security-audit' },
    });
    let parsed = null;
    try {
      parsed = JSON.parse(r.out);
    } catch {
      // ignore
    }
    if (
      r.code === 0 &&
      parsed?.hookSpecificOutput?.permissionDecision === 'deny' &&
      /blocked/.test(parsed?.hookSpecificOutput?.permissionDecisionReason || '')
    ) {
      pass('blockedSkills: hook returns deny JSON with reason mentioning blocked');
    } else {
      fail(`blockedSkills: hook code=${r.code} out=${r.out.slice(0, 200)}`);
    }
  }

  // allowedSkills whitelist refuses skill not in list (custom-* exempt)
  fs.writeFileSync(
    path.join(dir, '.claude/team-settings.json'),
    JSON.stringify({ allowedSkills: ['arch-audit', 'visual-audit'] }, null, 2),
  );
  {
    const r = invokeHook(dir, {
      tool_name: 'Skill',
      tool_input: { skill_name: 'security-audit' },
    });
    let parsed = null;
    try {
      parsed = JSON.parse(r.out);
    } catch {
      // ignore
    }
    if (
      r.code === 0 &&
      parsed?.hookSpecificOutput?.permissionDecision === 'deny' &&
      /allowedSkills/.test(parsed?.hookSpecificOutput?.permissionDecisionReason || '')
    ) {
      pass('allowedSkills whitelist: hook denies skill not in list');
    } else {
      fail(`allowedSkills deny: code=${r.code} out=${r.out.slice(0, 200)}`);
    }
  }

  // custom-* bypasses allowedSkills
  {
    const r = invokeHook(dir, {
      tool_name: 'Skill',
      tool_input: { skill_name: 'custom-experimental' },
    });
    if (r.code === 0 && r.out.trim() === '') {
      pass('allowedSkills: custom-* skill bypasses whitelist');
    } else {
      fail(`custom-* bypass: code=${r.code} out=${r.out.slice(0, 200)}`);
    }
  }

  // Non-Skill tool: hook does not interfere
  {
    const r = invokeHook(dir, {
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
    });
    if (r.code === 0 && r.out.trim() === '') {
      pass('Non-Skill tool (Bash): hook passes through silently');
    } else {
      fail(`Bash passthrough: code=${r.code} out=${r.out.slice(0, 200)}`);
    }
  }

  // Malformed team-settings.json: hook fails-open (allow)
  fs.writeFileSync(path.join(dir, '.claude/team-settings.json'), '{not json');
  {
    const r = invokeHook(dir, {
      tool_name: 'Skill',
      tool_input: { skill_name: 'security-audit' },
    });
    if (r.code === 0 && r.out.trim() === '') {
      pass('Malformed team-settings.json: hook fails open (allows silently)');
    } else {
      fail(`Malformed settings: code=${r.code} out=${r.out.slice(0, 200)}`);
    }
  }

  // Doctor team-settings-runtime-hook check passes when wired correctly
  {
    fs.writeFileSync(
      path.join(dir, '.claude/team-settings.json'),
      JSON.stringify({ blockedSkills: ['security-audit'] }, null, 2),
    );
    let out;
    try {
      out = execFileSync(
        'node',
        [path.resolve(__dirname, '../../src/index.js'), 'doctor', '--report'],
        { cwd: dir, encoding: 'utf8' },
      );
    } catch (e) {
      out = (e.stdout || '').toString();
    }
    let report = null;
    try {
      report = JSON.parse(out);
    } catch {
      // ignore
    }
    const check = report?.checks?.find((c) => c.id === 'team-settings-runtime-hook');
    if (check && check.status === 'pass') {
      pass(
        'doctor team-settings-runtime-hook: pass when team-settings.json + hook + settings.json all present',
      );
    } else {
      fail(`doctor team-settings-runtime-hook: ${check?.status} info=${check?.info}`);
    }
  }

  // Doctor team-settings-runtime-hook check warns when hook is removed
  {
    fs.unlinkSync(path.join(dir, '.claude/hooks/team-settings-enforcement.mjs'));
    let out;
    try {
      out = execFileSync(
        'node',
        [path.resolve(__dirname, '../../src/index.js'), 'doctor', '--report'],
        { cwd: dir, encoding: 'utf8' },
      );
    } catch (e) {
      out = (e.stdout || '').toString();
    }
    let report = null;
    try {
      report = JSON.parse(out);
    } catch {
      // ignore
    }
    const check = report?.checks?.find((c) => c.id === 'team-settings-runtime-hook');
    if (check && check.status === 'warn' && /missing/.test(check.info || '')) {
      pass('doctor team-settings-runtime-hook: warns when hook script is missing');
    } else {
      fail(`doctor warn missing: ${check?.status} info=${check?.info}`);
    }
  }
}

async function scenarioMcpAwareSkillsV120() {
  section('MCP-aware skill instrumentation: security-audit + dependency-audit (v1.20.0)');

  for (const tier of ['s', 'm', 'l']) {
    const config = { ...BASE, tier, isDiscovery: false };
    const dir = await scaffold(`mcp-aware-tier-${tier}`, tier, config);

    // /security-audit ships in all three tiers (minTier: 's')
    const securityPath = path.join(dir, '.claude/skills/security-audit/SKILL.md');
    if (fs.existsSync(securityPath)) {
      const body = fs.readFileSync(securityPath, 'utf8');

      if (
        /allowed-tools:.*mcp__mcp-nvd__get_cve/.test(body) &&
        /mcp__mcp-nvd__search_cve/.test(body)
      ) {
        pass(`Tier ${tier}: security-audit frontmatter declares mcp-nvd tools`);
      } else {
        fail(`Tier ${tier}: security-audit frontmatter missing mcp-nvd allowed-tools entries`);
      }

      if (
        /Step 3c\.A — MCP-aware path/.test(body) &&
        /Step 3c\.B — Fallback path/.test(body) &&
        /mcp-nvd unavailable, falling back/.test(body)
      ) {
        pass(`Tier ${tier}: security-audit Step 3c documents MCP path + fallback wording`);
      } else {
        fail(`Tier ${tier}: security-audit Step 3c missing MCP-aware structure or fallback text`);
      }

      if (body.includes('github.com/marcoeg/mcp-nvd')) {
        pass(`Tier ${tier}: security-audit pins mcp-nvd repo URL`);
      } else {
        fail(`Tier ${tier}: security-audit missing mcp-nvd repo URL pin`);
      }
    }

    // /dependency-audit only in M and L
    const depAuditPath = path.join(dir, '.claude/skills/dependency-audit/SKILL.md');
    if (tier === 'm' || tier === 'l') {
      if (!fs.existsSync(depAuditPath)) {
        fail(`Tier ${tier}: dependency-audit expected but absent`);
        continue;
      }
      const body = fs.readFileSync(depAuditPath, 'utf8');

      if (
        /allowed-tools:.*mcp__package-registry-mcp__lookup_package/.test(body) &&
        /mcp__package-registry-mcp__search_package/.test(body)
      ) {
        pass(`Tier ${tier}: dependency-audit frontmatter declares package-registry-mcp tools`);
      } else {
        fail(
          `Tier ${tier}: dependency-audit frontmatter missing package-registry-mcp allowed-tools entries`,
        );
      }

      if (
        /Path A — MCP-aware/.test(body) &&
        /Path B — Fallback/.test(body) &&
        /package-registry-mcp unavailable, falling back/.test(body)
      ) {
        pass(`Tier ${tier}: dependency-audit Step 2 documents MCP path + fallback wording`);
      } else {
        fail(`Tier ${tier}: dependency-audit Step 2 missing MCP-aware structure or fallback text`);
      }

      if (body.includes('github.com/Artmann/package-registry-mcp')) {
        pass(`Tier ${tier}: dependency-audit pins package-registry-mcp repo URL`);
      } else {
        fail(`Tier ${tier}: dependency-audit missing package-registry-mcp repo URL pin`);
      }
    }
  }
}

async function scenarioPrReviewPresent() {
  section('pr-review skill presence + tier pruning + team-settings prReviewSeverity (v1.19.0, C2)');

  for (const tier of ['s', 'm', 'l']) {
    const config = { ...BASE, tier, isDiscovery: false };
    const dir = await scaffold(`pr-review-tier-${tier}`, tier, config);
    const skillDir = path.join(dir, '.claude/skills/pr-review');
    const shouldExist = tier === 'm' || tier === 'l';

    if (shouldExist) {
      await assertSkillPresent(dir, tier, 'pr-review', { siblings: ['PATTERNS.md'] });

      const patternsMd = fs.readFileSync(path.join(skillDir, 'PATTERNS.md'), 'utf8');
      if (
        /## node-ts/.test(patternsMd) &&
        /## python/.test(patternsMd) &&
        /## swift/.test(patternsMd)
      ) {
        pass(`Tier ${tier}: pr-review PATTERNS.md covers top-3 stacks (node-ts, python, swift)`);
      } else {
        fail(`Tier ${tier}: pr-review PATTERNS.md missing top-3 stack sections`);
      }

      const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
      const isReadOnly =
        /Never call `gh pr merge`/.test(skillMd) && /Never modify code/.test(skillMd);
      if (isReadOnly) {
        pass(`Tier ${tier}: pr-review enforces hard rules (no auto-merge, no code modification)`);
      } else {
        fail(`Tier ${tier}: pr-review missing read-only hard rules`);
      }

      const cheatsheet = fs.readFileSync(path.join(dir, '.claude/cheatsheet.md'), 'utf8');
      if (/\/pr-review/.test(cheatsheet)) {
        pass(`Tier ${tier}: cheatsheet has /pr-review row`);
      } else {
        fail(`Tier ${tier}: cheatsheet missing /pr-review row`);
      }

      const pipeline = fs.readFileSync(path.join(dir, '.claude/rules/pipeline.md'), 'utf8');
      if (/\/pr-review/.test(pipeline)) {
        pass(`Tier ${tier}: pipeline.md Phase 8 invokes /pr-review`);
      } else {
        fail(`Tier ${tier}: pipeline.md missing /pr-review invocation`);
      }
    } else {
      if (!fs.existsSync(skillDir)) {
        pass(`Tier ${tier}: pr-review pruned (not on tier S)`);
      } else {
        fail(`Tier ${tier}: pr-review present but should be pruned`);
      }
    }
  }

  // team-settings prReviewSeverity validation (using doctor --report indirectly)
  const dir = await scaffold('pr-review-team-settings', 'm', {
    ...BASE,
    tier: 'm',
    isDiscovery: false,
  });

  // Valid prReviewSeverity passes doctor team-settings-compliance
  fs.writeFileSync(
    path.join(dir, '.claude/team-settings.json'),
    JSON.stringify(
      { prReviewSeverity: { critical: ['src/auth/**'], major: ['src/api/**'] } },
      null,
      2,
    ),
  );
  {
    let out;
    try {
      out = execFileSync(
        'node',
        [path.resolve(__dirname, '../../src/index.js'), 'doctor', '--report'],
        { cwd: dir, encoding: 'utf8' },
      );
    } catch (e) {
      // doctor exits non-zero when any check fails (e.g., claude-cli missing on CI runners).
      // The JSON report is still emitted on stdout — capture it.
      out = (e.stdout || '').toString();
    }
    let report = null;
    try {
      report = JSON.parse(out);
    } catch {
      // ignore
    }
    const check = report?.checks?.find((c) => c.id === 'team-settings-compliance');
    if (check && (check.status === 'pass' || check.status === 'skip')) {
      pass('Valid prReviewSeverity: doctor team-settings-compliance passes');
    } else {
      fail(`Valid prReviewSeverity: doctor = ${check?.status}, info=${check?.info}`);
    }
  }

  // Invalid prReviewSeverity (non-array critical) fails parsing
  fs.writeFileSync(
    path.join(dir, '.claude/team-settings.json'),
    JSON.stringify({ prReviewSeverity: { critical: 'src/auth/**' } }, null, 2),
  );
  {
    let out;
    try {
      out = execFileSync(
        'node',
        [path.resolve(__dirname, '../../src/index.js'), 'doctor', '--report'],
        { cwd: dir, encoding: 'utf8' },
      );
    } catch (e) {
      out = (e.stdout || '').toString();
    }
    let report = null;
    try {
      report = JSON.parse(out);
    } catch {
      // ignore
    }
    const check = report?.checks?.find((c) => c.id === 'team-settings-compliance');
    if (
      check &&
      check.status === 'warn' &&
      /prReviewSeverity\.critical must be an array/.test(check.info || '')
    ) {
      pass('Invalid prReviewSeverity: doctor warns with descriptive parser error');
    } else {
      fail(`Invalid prReviewSeverity: doctor = ${check?.status}, info=${check?.info}`);
    }
  }
}

async function scenarioDependencyAuditPresent() {
  section('dependency-audit skill presence + tier pruning (v1.18.0, C1)');

  for (const tier of ['s', 'm', 'l']) {
    const config = { ...BASE, tier, isDiscovery: false };
    const dir = await scaffold(`dependency-audit-tier-${tier}`, tier, config);
    const skillDir = path.join(dir, '.claude/skills/dependency-audit');
    const shouldExist = tier === 'm' || tier === 'l';

    if (shouldExist) {
      await assertSkillPresent(dir, tier, 'dependency-audit', { siblings: ['PATTERNS.md'] });

      const patternsMd = fs.readFileSync(path.join(skillDir, 'PATTERNS.md'), 'utf8');
      if (
        /## node-ts/.test(patternsMd) &&
        /## python/.test(patternsMd) &&
        /## swift/.test(patternsMd)
      ) {
        pass(
          `Tier ${tier}: dependency-audit PATTERNS.md covers top-3 stacks (node-ts, python, swift)`,
        );
      } else {
        fail(`Tier ${tier}: dependency-audit PATTERNS.md missing top-3 stack sections`);
      }

      const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
      const hasAuditOnly = /read-only by default|Audit-only/.test(skillMd);
      const applyModeOnlyInOutOfScope =
        /## Out of scope[\s\S]*?Apply mode/.test(skillMd) &&
        !/^\| `mode:apply-tier-a`/m.test(skillMd);
      if (hasAuditOnly && applyModeOnlyInOutOfScope) {
        pass(
          `Tier ${tier}: dependency-audit ships audit-only in v1 (apply mode only in Out of scope)`,
        );
      } else {
        fail(
          `Tier ${tier}: dependency-audit should be audit-only in v1; apply mode leaked into SKILL.md operating modes`,
        );
      }

      const cheatsheet = fs.readFileSync(path.join(dir, '.claude/cheatsheet.md'), 'utf8');
      if (/\/dependency-audit/.test(cheatsheet)) {
        pass(`Tier ${tier}: cheatsheet has /dependency-audit row`);
      } else {
        fail(`Tier ${tier}: cheatsheet missing /dependency-audit row`);
      }

      const pipeline = fs.readFileSync(path.join(dir, '.claude/rules/pipeline.md'), 'utf8');
      if (/\/dependency-audit/.test(pipeline)) {
        pass(`Tier ${tier}: pipeline.md Track C invokes /dependency-audit`);
      } else {
        fail(`Tier ${tier}: pipeline.md missing /dependency-audit invocation`);
      }
    } else {
      if (!fs.existsSync(skillDir)) {
        pass(`Tier ${tier}: dependency-audit pruned (not on tier S)`);
      } else {
        fail(`Tier ${tier}: dependency-audit present but should be pruned`);
      }
    }
  }
}

async function scenarioComplianceAuditPresent() {
  section('compliance-audit skill presence + tier pruning (v1.14.0)');

  for (const tier of ['s', 'm', 'l']) {
    const config = { ...BASE, tier, isDiscovery: false };
    const dir = await scaffold(`compliance-audit-tier-${tier}`, tier, config);
    const skillDir = path.join(dir, '.claude/skills/compliance-audit');
    const shouldExist = tier === 'm' || tier === 'l';

    if (shouldExist) {
      await assertSkillPresent(dir, tier, 'compliance-audit', { siblings: ['PROFILES.md'] });

      // Verify PROFILES.md scaffolds SOC2/HIPAA as future markers
      const profilesMd = fs.readFileSync(path.join(skillDir, 'PROFILES.md'), 'utf8');
      if (
        /NOT ACTIVE in v1\.14/.test(profilesMd) &&
        /SOC 2/.test(profilesMd) &&
        /HIPAA/.test(profilesMd)
      ) {
        pass(`Tier ${tier}: compliance-audit PROFILES.md scaffolds SOC2 + HIPAA as future-markers`);
      } else {
        fail(
          `Tier ${tier}: compliance-audit PROFILES.md missing SOC2/HIPAA future-marker structure`,
        );
      }
    } else {
      if (!fs.existsSync(skillDir)) {
        pass(`Tier ${tier}: compliance-audit pruned (not on tier S)`);
      } else {
        fail(`Tier ${tier}: compliance-audit present but should be pruned`);
      }
    }
  }
}

async function scenarioUpgradeAnthropic() {
  section('upgrade --anthropic refresh + dry-run + doctor anthropic-files-current (v1.15.0)');

  const CLI = path.resolve(__dirname, '../../src/index.js');

  function runCli(args, cwd) {
    try {
      return {
        stdout: execFileSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }),
        code: 0,
      };
    } catch (e) {
      return { stdout: (e.stdout || '').toString(), code: e.status || 1 };
    }
  }

  // Scaffold a Tier M project to exercise the tier-aware ANTHROPIC_FILES entries
  const config = { ...BASE, tier: 'm', isDiscovery: false };
  const dir = await scaffold('upgrade-anthropic-tier-m', 'm', config);

  // Sanity baseline: dry-run on a clean scaffold reports "already current"
  {
    const out = runCli(['upgrade', '--anthropic'], dir);
    if (/Anthropic-influenced files are already current/.test(out.stdout)) {
      pass('Clean scaffold: --anthropic dry-run reports up-to-date');
    } else {
      fail('Clean scaffold: --anthropic dry-run did not report up-to-date');
    }
  }

  // Simulate stale arch-audit/advanced-checks.md by appending a marker line
  const archSkillPath = path.join(dir, '.claude/skills/arch-audit/advanced-checks.md');
  const originalArch = fs.readFileSync(archSkillPath, 'utf8');
  const staleArch = originalArch + '\n<!-- intentional stale marker -->\n';
  fs.writeFileSync(archSkillPath, staleArch);

  // Dry-run: should print diff and NOT overwrite
  {
    const out = runCli(['upgrade', '--anthropic'], dir);
    if (/arch-audit\/SKILL\.md/.test(out.stdout)) {
      pass('Stale arch-audit: --anthropic dry-run lists the file');
    } else {
      fail('Stale arch-audit: --anthropic dry-run did not list the file');
    }
    if (/Dry run\. Re-run with `--anthropic --apply`/.test(out.stdout)) {
      pass('Dry-run mode emits "--apply" hint');
    } else {
      fail('Dry-run mode missing "--apply" hint');
    }
    const after = fs.readFileSync(archSkillPath, 'utf8');
    if (after === staleArch) {
      pass('Dry-run: arch-audit/advanced-checks.md left untouched on disk');
    } else {
      fail('Dry-run: arch-audit/advanced-checks.md was modified - should be untouched');
    }
  }

  // Doctor reports drift via anthropic-files-current
  {
    const out = runCli(['doctor', '--report'], dir);
    let report = null;
    try {
      report = JSON.parse(out.stdout);
    } catch {
      // ignore
    }
    if (report) {
      const check = report.checks?.find((c) => c.id === 'anthropic-files-current');
      if (check && (check.status === 'warn' || check.status === 'fail')) {
        pass(`doctor anthropic-files-current = ${check.status} on stale arch-audit`);
      } else {
        fail(`doctor anthropic-files-current = ${check?.status} (expected warn/fail)`);
      }
    } else {
      fail('doctor --report did not emit valid JSON');
    }
  }

  // Apply: overwrites file with template + creates .bak
  {
    const out = runCli(['upgrade', '--anthropic', '--apply'], dir);
    if (/Anthropic refresh complete/.test(out.stdout)) {
      pass('--anthropic --apply emits success message');
    } else {
      fail('--anthropic --apply did not emit success message');
    }
    const refreshed = fs.readFileSync(archSkillPath, 'utf8');
    if (refreshed === originalArch) {
      pass('--apply: arch-audit/advanced-checks.md restored to original template content');
    } else {
      fail('--apply: arch-audit/advanced-checks.md content does not match original template');
    }
    const after = fs.readdirSync(path.join(dir, '.claude/skills/arch-audit'));
    const bakFiles = after.filter((f) => f.startsWith('advanced-checks.md.bak.'));
    if (bakFiles.length === 1) {
      pass(`--apply: exactly one .bak file created (${bakFiles[0]})`);
    } else {
      fail(`--apply: expected 1 .bak file, found ${bakFiles.length}`);
    }
  }

  // Doctor anthropic-files-current passes after apply
  {
    const out = runCli(['doctor', '--report'], dir);
    let report = null;
    try {
      report = JSON.parse(out.stdout);
    } catch {
      // ignore
    }
    if (report) {
      const check = report.checks?.find((c) => c.id === 'anthropic-files-current');
      if (check && (check.status === 'pass' || check.status === 'skip')) {
        pass(`doctor anthropic-files-current = ${check.status} after --apply`);
      } else {
        fail(
          `doctor anthropic-files-current = ${check?.status} (expected pass/skip after refresh)`,
        );
      }
    } else {
      fail('doctor --report did not emit valid JSON after refresh');
    }
  }

  // Tier S scaffold: --anthropic uses tier-s/ template path
  {
    const dirS = await scaffold('upgrade-anthropic-tier-s', 's', {
      ...BASE,
      tier: 's',
      isDiscovery: false,
    });
    const out = runCli(['upgrade', '--anthropic'], dirS);
    if (/Anthropic-influenced files are already current/.test(out.stdout)) {
      pass('Tier S scaffold: --anthropic dry-run reports up-to-date (tier-aware path)');
    } else {
      fail('Tier S scaffold: --anthropic dry-run did not report up-to-date');
    }
  }

  // No tier detected: --anthropic skips gracefully
  {
    const dirNoTier = path.join(OUTPUT_DIR, 'upgrade-anthropic-no-tier');
    await fs.ensureDir(dirNoTier);
    const out = runCli(['upgrade', '--anthropic'], dirNoTier);
    if (/No scaffolded tier detected/.test(out.stdout)) {
      pass('No-scaffold dir: --anthropic skips with informative message');
    } else {
      fail('No-scaffold dir: --anthropic did not skip gracefully');
    }
  }
}

async function scenarioTeamSettings() {
  section('team-settings.json governance: init / upgrade / add / doctor (v1.16.0)');

  const CLI = path.resolve(__dirname, '../../src/index.js');

  function runCli(args, cwd) {
    try {
      return {
        stdout: execFileSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }),
        code: 0,
      };
    } catch (e) {
      return {
        stdout: (e.stdout || '').toString() + (e.stderr || '').toString(),
        code: e.status || 1,
      };
    }
  }

  // Baseline: tier-m scaffold without team-settings.json (unrestricted)
  const baseConfig = { ...BASE, tier: 'm', isDiscovery: false };
  const dirNoSettings = await scaffold('team-settings-absent', 'm', baseConfig);
  {
    const out = runCli(['doctor', '--report'], dirNoSettings);
    let report = null;
    try {
      report = JSON.parse(out.stdout);
    } catch {
      // ignore
    }
    const check = report?.checks?.find((c) => c.id === 'team-settings-compliance');
    if (check && check.status === 'skip') {
      pass('Absent team-settings.json: doctor team-settings-compliance = skip');
    } else {
      fail(`Absent team-settings.json: doctor check = ${check?.status} (expected skip)`);
    }
  }

  // Tier-S scaffold + team-settings.json with minTier=m → doctor warn
  const dirTierS = await scaffold('team-settings-mintier-violation', 's', {
    ...BASE,
    tier: 's',
    isDiscovery: false,
  });
  fs.writeFileSync(
    path.join(dirTierS, '.claude/team-settings.json'),
    JSON.stringify({ minTier: 'm' }, null, 2),
  );
  {
    const out = runCli(['doctor', '--report'], dirTierS);
    let report = null;
    try {
      report = JSON.parse(out.stdout);
    } catch {
      // ignore
    }
    const check = report?.checks?.find((c) => c.id === 'team-settings-compliance');
    if (check && check.status === 'warn' && /minTier=m/.test(check.info || '')) {
      pass('Tier-S + minTier=m: doctor warn with minTier violation message');
    } else {
      fail(
        `Tier-S + minTier=m: doctor check = ${check?.status}, info=${check?.info} (expected warn with minTier=m)`,
      );
    }
  }

  // upgrade refuses on minTier violation
  {
    const out = runCli(['upgrade'], dirTierS);
    if (
      out.code !== 0 &&
      /requires minTier=m/.test(out.stdout) &&
      /init --tier=m/.test(out.stdout)
    ) {
      pass('upgrade refuses minTier violation with promotion suggestion');
    } else {
      fail(`upgrade should refuse + suggest tier promotion (code=${out.code})`);
    }
  }

  // Tier-M scaffold + team-settings.json blockedSkills → add skill refused
  const dirTierM = await scaffold('team-settings-blocked', 'm', baseConfig);
  fs.writeFileSync(
    path.join(dirTierM, '.claude/team-settings.json'),
    JSON.stringify({ blockedSkills: ['security-audit'] }, null, 2),
  );
  {
    const out = runCli(['add', 'skill', 'security-audit'], dirTierM);
    if (out.code !== 0 && /blocked by .claude\/team-settings\.json/.test(out.stdout)) {
      pass('add skill: blocked skill is refused with reference to team-settings');
    } else {
      fail(`add skill blocked: code=${out.code}, stdout=${out.stdout.slice(0, 200)}`);
    }
  }

  // allowedSkills whitelist refuses skill not in list
  fs.writeFileSync(
    path.join(dirTierM, '.claude/team-settings.json'),
    JSON.stringify({ allowedSkills: ['arch-audit', 'visual-audit'] }, null, 2),
  );
  {
    const out = runCli(['add', 'skill', 'security-audit'], dirTierM);
    if (out.code !== 0 && /not in the allowedSkills/.test(out.stdout)) {
      pass('add skill: skill outside allowedSkills is refused');
    } else {
      fail(`add skill not-allowed: code=${out.code}, stdout=${out.stdout.slice(0, 200)}`);
    }
  }

  // Required skills missing → doctor warn
  fs.writeFileSync(
    path.join(dirTierM, '.claude/team-settings.json'),
    JSON.stringify({ requiredSkills: ['nonexistent-skill'] }, null, 2),
  );
  {
    const out = runCli(['doctor', '--report'], dirTierM);
    let report = null;
    try {
      report = JSON.parse(out.stdout);
    } catch {
      // ignore
    }
    const check = report?.checks?.find((c) => c.id === 'team-settings-compliance');
    if (check && check.status === 'warn' && /required skills missing/.test(check.info || '')) {
      pass('requiredSkills missing: doctor warn with explicit message');
    } else {
      fail(
        `requiredSkills missing: doctor = ${check?.status}, info=${check?.info} (expected warn)`,
      );
    }
  }

  // Mutual exclusion: invalid team-settings.json → doctor warn with parse error
  fs.writeFileSync(
    path.join(dirTierM, '.claude/team-settings.json'),
    JSON.stringify({ allowedSkills: ['arch-audit'], blockedSkills: ['arch-audit'] }, null, 2),
  );
  {
    const out = runCli(['doctor', '--report'], dirTierM);
    let report = null;
    try {
      report = JSON.parse(out.stdout);
    } catch {
      // ignore
    }
    const check = report?.checks?.find((c) => c.id === 'team-settings-compliance');
    if (check && check.status === 'warn' && /must not overlap/.test(check.info || '')) {
      pass('allowed/blocked overlap: doctor warn with mutual-exclusion message');
    } else {
      fail(`overlap: doctor = ${check?.status}, info=${check?.info}`);
    }
  }

  // Malformed JSON → upgrade exits with parse error
  fs.writeFileSync(path.join(dirTierM, '.claude/team-settings.json'), '{not json');
  {
    const out = runCli(['upgrade'], dirTierM);
    if (out.code !== 0 && /not valid JSON/.test(out.stdout)) {
      pass('upgrade: malformed team-settings.json exits with descriptive error');
    } else {
      fail(`malformed: upgrade code=${out.code}, stdout=${out.stdout.slice(0, 200)}`);
    }
  }

  // custom-* skills bypass allowedSkills whitelist (presence in add does not apply since no template;
  // verify via doctor that custom-* installed is NOT flagged when allowedSkills omits it)
  fs.writeFileSync(
    path.join(dirTierM, '.claude/team-settings.json'),
    JSON.stringify({ allowedSkills: ['arch-audit'] }, null, 2),
  );
  // Simulate a custom skill installed
  await fs.ensureDir(path.join(dirTierM, '.claude/skills/custom-experimental'));
  fs.writeFileSync(
    path.join(dirTierM, '.claude/skills/custom-experimental/SKILL.md'),
    '---\nname: custom-experimental\n---\n# stub\n',
  );
  {
    const out = runCli(['doctor', '--report'], dirTierM);
    let report = null;
    try {
      report = JSON.parse(out.stdout);
    } catch {
      // ignore
    }
    const check = report?.checks?.find((c) => c.id === 'team-settings-compliance');
    // allowedSkills is not presence-required: custom-experimental should NOT cause warn here
    if (check && check.status === 'pass') {
      pass('custom-* skill present + allowedSkills set: doctor pass (custom bypass)');
    } else {
      fail(
        `custom bypass: doctor = ${check?.status}, info=${check?.info} (expected pass; custom-* not presence-required)`,
      );
    }
  }

  // blockedSkills enforced even on custom-*
  fs.writeFileSync(
    path.join(dirTierM, '.claude/team-settings.json'),
    JSON.stringify({ blockedSkills: ['custom-experimental'] }, null, 2),
  );
  {
    const out = runCli(['doctor', '--report'], dirTierM);
    let report = null;
    try {
      report = JSON.parse(out.stdout);
    } catch {
      // ignore
    }
    const check = report?.checks?.find((c) => c.id === 'team-settings-compliance');
    if (
      check &&
      check.status === 'warn' &&
      /blocked skills installed.*custom-experimental/.test(check.info || '')
    ) {
      pass('blockedSkills enforces custom-* (governance > preservation)');
    } else {
      fail(`blocked custom: doctor = ${check?.status}, info=${check?.info}`);
    }
  }
}

async function scenarioMCPServer() {
  section('CDK governance MCP server (v1.17.0): tool surface + read-only outputs');

  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

  const SERVER_PATH = path.resolve(__dirname, '../../src/mcp/server.js');

  const config = { ...BASE, tier: 'm', isDiscovery: false };
  const dir = await scaffold('mcp-server-tier-m', 'm', config);

  // Drop a team-settings.json so cdk_team_settings has something interesting to return
  fs.writeFileSync(
    path.join(dir, '.claude/team-settings.json'),
    JSON.stringify({ minTier: 'm', requiredSkills: ['arch-audit'] }, null, 2),
  );

  // Mark a recent arch-audit so cdk_arch_audit_status returns a populated payload
  const sessionDir = path.join(dir, '.claude/session');
  await fs.ensureDir(sessionDir);
  const fixedEpoch = Math.floor(Date.now() / 1000) - 3 * 86400; // 3 days ago
  fs.writeFileSync(path.join(sessionDir, 'last-arch-audit'), `${fixedEpoch}\n`);

  const transport = new StdioClientTransport({
    command: 'node',
    args: [SERVER_PATH],
    env: { ...process.env, CDK_PROJECT_ROOT: dir },
    stderr: 'pipe',
  });

  const client = new Client(
    { name: 'cdk-integration-test', version: '0.0.1' },
    { capabilities: {} },
  );

  try {
    await client.connect(transport);
    pass('MCP server: connect via stdio succeeds');

    const tools = await client.listTools();
    const expected = [
      'cdk_doctor_report',
      'cdk_team_settings',
      'cdk_arch_audit_status',
      'cdk_skill_inventory',
      'cdk_package_meta',
      'cdk_pr_review',
    ];
    const got = tools.tools.map((t) => t.name).sort();
    if (JSON.stringify(got) === JSON.stringify(expected.sort())) {
      pass(`MCP server: listTools returns ${expected.length} expected tools`);
    } else {
      fail(`MCP server: tool list mismatch. expected=${expected}, got=${got}`);
    }

    function parseToolReply(result) {
      const text = result?.content?.[0]?.text;
      if (!text) throw new Error('no content[0].text in tool result');
      return JSON.parse(text);
    }

    const meta = parseToolReply(await client.callTool({ name: 'cdk_package_meta', arguments: {} }));
    if (meta.name === 'tierward' && meta.cwd === dir) {
      pass('cdk_package_meta: name + cwd correct');
    } else {
      fail(`cdk_package_meta: ${JSON.stringify(meta)}`);
    }

    const team = parseToolReply(
      await client.callTool({ name: 'cdk_team_settings', arguments: {} }),
    );
    if (
      team.present === true &&
      team.settings?.minTier === 'm' &&
      Array.isArray(team.settings?.requiredSkills)
    ) {
      pass('cdk_team_settings: present=true, minTier and requiredSkills parsed');
    } else {
      fail(`cdk_team_settings: ${JSON.stringify(team)}`);
    }

    const arch = parseToolReply(
      await client.callTool({ name: 'cdk_arch_audit_status', arguments: {} }),
    );
    if (
      arch.everRan === true &&
      arch.lastRunUnix === fixedEpoch &&
      typeof arch.ageDays === 'number'
    ) {
      pass(`cdk_arch_audit_status: lastRunUnix matches, ageDays=${arch.ageDays.toFixed(2)}`);
    } else {
      fail(`cdk_arch_audit_status: ${JSON.stringify(arch)}`);
    }

    const inv = parseToolReply(
      await client.callTool({ name: 'cdk_skill_inventory', arguments: {} }),
    );
    if (inv.present === true && Array.isArray(inv.skills) && inv.count > 0) {
      pass(`cdk_skill_inventory: present, count=${inv.count}`);
    } else {
      fail(`cdk_skill_inventory: ${JSON.stringify(inv)}`);
    }

    const doctorReport = parseToolReply(
      await client.callTool({ name: 'cdk_doctor_report', arguments: {} }),
    );
    if (
      doctorReport &&
      typeof doctorReport.timestamp === 'string' &&
      Array.isArray(doctorReport.checks) &&
      doctorReport.checks.length >= 20
    ) {
      pass(
        `cdk_doctor_report: ${doctorReport.checks.length} checks, summary=${JSON.stringify(doctorReport.summary)}`,
      );
    } else {
      fail(`cdk_doctor_report: unexpected shape ${JSON.stringify(doctorReport).slice(0, 200)}`);
    }

    // Negative case: arch-audit absent
    const dirNoAudit = await scaffold('mcp-server-no-audit', 'm', config);
    const transport2 = new StdioClientTransport({
      command: 'node',
      args: [SERVER_PATH],
      env: { ...process.env, CDK_PROJECT_ROOT: dirNoAudit },
      stderr: 'pipe',
    });
    const client2 = new Client(
      { name: 'cdk-integration-test-2', version: '0.0.1' },
      { capabilities: {} },
    );
    await client2.connect(transport2);
    const archEmpty = parseToolReply(
      await client2.callTool({ name: 'cdk_arch_audit_status', arguments: {} }),
    );
    if (archEmpty.everRan === false && archEmpty.lastRunUnix === null) {
      pass('cdk_arch_audit_status: clean scaffold reports everRan=false');
    } else {
      fail(`cdk_arch_audit_status (no run): ${JSON.stringify(archEmpty)}`);
    }
    const teamAbsent = parseToolReply(
      await client2.callTool({ name: 'cdk_team_settings', arguments: {} }),
    );
    if (teamAbsent.present === false && teamAbsent.settings === null) {
      pass('cdk_team_settings: absent file reports present=false');
    } else {
      fail(`cdk_team_settings (absent): ${JSON.stringify(teamAbsent)}`);
    }
    await client2.close();

    await client.close();
  } catch (err) {
    fail(`MCP server scenario: ${err.message}`);
    try {
      await client.close();
    } catch {
      // ignore
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log();
  console.log(c.bold('claude-dev-kit - Integration tests'));
  console.log(c.dim(`Output: ${OUTPUT_DIR}`));
  console.log(c.dim(`Verbose: ${VERBOSE ? 'on' : 'off (use --verbose for full output)'}`));

  // Clean previous output
  await fs.remove(OUTPUT_DIR);
  await fs.ensureDir(OUTPUT_DIR);

  await scenarioTier0();
  await scenarioTierS_full();
  await scenarioTierS_minimal();
  await scenarioTierM();
  await scenarioTierL();
  await scenarioInPlaceSafe();
  await scenarioStopHookContent();
  await scenarioArchAuditTimestamp();
  await scenarioPerfAuditPlaceholders();
  await scenarioSkillDevApplicabilityCheck();
  await scenarioPipelineGateCount();
  await scenarioCrossTierLint();
  await scenarioGateEnumeration();
  await scenarioPlaceholderCoverage();
  await scenarioSkillPruning();
  await scenarioTierSSkillPruning();
  await scenarioUiAuditPruning();
  await scenarioCommitSkillAllTiers();
  await scenarioNewRuleFiles();
  await scenarioNewStacks();
  await scenarioNativeStackCommandDefaults();
  await scenarioSecurityVariants();
  await scenarioPlaceholderNoiseReduction();
  await scenarioInPlaceClaudeMdGeneration();
  await scenarioCheatsheetPruning();
  await scenarioNativeSkillAdaptation();
  await scenarioExcludeNativeWithFrontend();
  await scenarioWizardCoverage();
  await scenarioRubricScore();
  await scenarioNewSkillScaffolder();
  await scenarioSwiftContentAssertions();
  await scenarioNodeTsContentAssertions();
  await scenarioPythonContentAssertions();
  await scenarioCrossStackInvariants();
  await scenarioSkillMdSpecCompliance();
  await scenarioDoctorCrossFileValidation();
  await scenarioDocAuditPresent();
  await scenarioApiContractAuditPresent();
  await scenarioInfraAuditPresent();
  await scenarioComplianceAuditPresent();
  await scenarioDependencyAuditPresent();
  await scenarioPrReviewPresent();
  await scenarioMcpAwareSkillsV120();
  await scenarioRuntimeEnforcementHook();
  await scenarioSkillDevHotspot();
  await scenarioUpgradeAnthropic();
  await scenarioTeamSettings();
  await scenarioMCPServer();

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log();
  console.log(c.bold('─────────────────────────────────'));
  console.log(
    `${c.green(`✓ ${passed} passed`)}  ${failed > 0 ? c.red(`✗ ${failed} failed`) : c.dim(`✗ ${failed} failed`)}  ${c.yellow(`⚠ ${warned} warned`)}`,
  );

  if (failures.length > 0) {
    console.log();
    console.log(c.bold(c.red('Failures:')));
    for (const f of failures) {
      console.log(`  ${c.red('✗')} ${f}`);
    }
  }

  console.log();

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(c.red('\nUnhandled error:'), err.message);
  process.exit(1);
});
