import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { createPatch } from 'diff';
import { violatesMinTier } from '../utils/team-settings.js';
import { printStarCta } from '../utils/print-plan.js';
import { loadTeamSettingsOrExit } from '../utils/team-settings-cli.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');

// Files refreshed automatically: the scaffold copies them 1:1 and the user is
// not expected to edit them. A file that differs is backed up before it is
// replaced; a missing one is added (every tier ships output-style.md).
export const UPGRADEABLE_FILES = [
  { template: 'common/rules/output-style.md', target: '.claude/rules/output-style.md' },
];

// Files the scaffold fills in (placeholders, staging stripping, reference
// pruning) or that the user is told to edit, so the raw template is not what
// the project should hold. Upgrade never writes or adds them: it prints the
// template diff for the user to apply by hand.
export const REVIEW_DIFF_FILES = [
  { template: 'common/rules/git.md', target: '.claude/rules/git.md' },
  { template: 'common/rules/security.md', target: '.claude/rules/security.md' },
  { template: 'common/context-review.md', target: '.claude/rules/context-review.md' },
  { template: 'common/files-guide.md', target: '.claude/files-guide.md' },
  { template: 'common/PULL_REQUEST_TEMPLATE.md', target: '.github/PULL_REQUEST_TEMPLATE.md' },
  // Narrowed to `main` on projects without staging, so not copied 1:1 there.
  {
    template: 'common/.claude/hooks/tierward-governance-gate.mjs',
    target: '.claude/hooks/tierward-governance-gate.mjs',
  },
];

// Files that require user review before upgrade (they may contain customizations)
const REVIEW_REQUIRED = [
  '.claude/rules/pipeline.md',
  '.claude/settings.json',
  'CLAUDE.md',
  'MEMORY.md',
  // Skills (may contain project-specific customizations added after init)
  '.claude/skills/arch-audit/SKILL.md',
  '.claude/skills/visual-audit/SKILL.md',
  '.claude/skills/ux-audit/SKILL.md',
  '.claude/skills/responsive-audit/SKILL.md',
  '.claude/skills/security-audit/SKILL.md',
  '.claude/skills/skill-dev/SKILL.md',
  '.claude/skills/skill-db/SKILL.md',
  '.claude/skills/perf-audit/SKILL.md',
  '.claude/skills/api-design/SKILL.md',
  '.claude/skills/commit/SKILL.md',
  '.claude/skills/ui-audit/SKILL.md',
];

// Files that encode Anthropic spec / best practices and should be refreshed
// when Anthropic publishes guidance updates.
//
// v1.15.0 scope is limited to files that the scaffold copies 1:1 from the
// template, so a raw template vs scaffolded-content compare is meaningful.
// Files that pass through `interpolate()` placeholder substitution or
// flag-based section stripping (`pipeline-standards.md`, `claudemd-standards.md`,
// `arch-audit/SKILL.md`) produce false-positive drift on a clean install and
// stay in REVIEW_REQUIRED until a transformation-aware compare is implemented
// in a future release.
export const ANTHROPIC_FILES = [
  {
    // Tier resolved at runtime by detectScaffoldedTier(cwd). advanced-checks.md
    // is byte-identical across the three tiers, but the path is tier-prefixed
    // in the template tree.
    templateTierAware: 'tier-{TIER}/.claude/skills/arch-audit/advanced-checks.md',
    target: '.claude/skills/arch-audit/advanced-checks.md',
  },
];

/**
 * Builds a backup file path with an ISO timestamp suffix:
 * `<original>.bak.2026-04-25T14-30-00`. Returns the absolute path.
 */
export function backupPath(originalPath, now = new Date()) {
  const stamp = now
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace(/-\d{3}Z$/, '');
  return `${originalPath}.bak.${stamp}`;
}

/**
 * Detects which tier (s, m, or l) was scaffolded into cwd by inspecting
 * `.claude/rules/pipeline.md`. Returns null when no scaffold is present.
 */
export function detectScaffoldedTier(cwd) {
  const pipelinePath = path.join(cwd, '.claude/rules/pipeline.md');
  if (!fs.existsSync(pipelinePath)) return null;
  const head = fs.readFileSync(pipelinePath, 'utf8').split('\n').slice(0, 3).join('\n');
  if (/Fast Lane Pipeline/.test(head)) return 's';
  if (/Standard Development Pipeline - Tier M/.test(head)) return 'm';
  if (/Full Development Pipeline - Tier L/.test(head)) return 'l';
  return null;
}

/**
 * Resolves a template path with tier substitution applied when the entry uses
 * `templateTierAware`. Plain `template` entries pass through.
 */
function resolveTemplatePath(entry, tier) {
  if (entry.template) return path.join(TEMPLATES_DIR, entry.template);
  if (entry.templateTierAware && tier) {
    return path.join(TEMPLATES_DIR, entry.templateTierAware.replace('{TIER}', tier));
  }
  return null;
}

/**
 * Looks up a target by exact file name, so a case-insensitive disk does not
 * pass a project's own `pull_request_template.md` off as Tierward's
 * `PULL_REQUEST_TEMPLATE.md`. Returns 'exact', 'variant' (same name in another
 * letter case) or 'absent'.
 */
function findTarget(targetPath) {
  const dir = path.dirname(targetPath);
  const name = path.basename(targetPath);
  if (!fs.existsSync(dir)) return 'absent';
  const entries = fs.readdirSync(dir);
  if (entries.includes(name)) return 'exact';
  if (entries.some((e) => e.toLowerCase() === name.toLowerCase())) return 'variant';
  return 'absent';
}

export async function upgrade(options) {
  const cwd = process.cwd();
  console.log();
  console.log(chalk.bold('tierward upgrade'));
  console.log();

  const settings = loadTeamSettingsOrExit(cwd);
  const currentTier = detectScaffoldedTier(cwd);
  if (currentTier) {
    const required = violatesMinTier(settings, currentTier);
    if (required) {
      console.error(
        chalk.red(
          `✗ team-settings.json requires minTier=${required}, current scaffold is tier ${currentTier}.`,
        ),
      );
      console.error(
        `  Re-run ${chalk.cyan(`tierward init --tier=${required}`)} to promote, or edit .claude/team-settings.json.`,
      );
      process.exit(1);
    }
  }

  await runStandardUpgrade(cwd, options);

  if (options.anthropic) {
    console.log();
    console.log(chalk.bold('tierward upgrade --anthropic'));
    console.log();
    await runAnthropicUpgrade(cwd, options);
  }
}

async function runStandardUpgrade(cwd, options) {
  // Every tier writes .claude/settings.json. Without it this is not a
  // Tierward project, and upgrade must not seed template files into it.
  if (!fs.existsSync(path.join(cwd, '.claude', 'settings.json'))) {
    console.log(
      chalk.yellow(
        '⚠ No Tierward scaffold found (`.claude/settings.json` missing). Nothing to upgrade.',
      ),
    );
    return;
  }

  const updates = [];
  const ownFiles = [];

  for (const file of UPGRADEABLE_FILES) {
    const templatePath = path.join(TEMPLATES_DIR, file.template);
    const targetPath = path.join(cwd, file.target);

    if (!fs.existsSync(templatePath)) continue;

    const found = findTarget(targetPath);
    if (found === 'variant') {
      ownFiles.push(file.target);
      continue;
    }
    if (found === 'absent') {
      updates.push({ ...file, reason: 'new file' });
      continue;
    }

    const templateContent = fs.readFileSync(templatePath, 'utf8');
    const targetContent = fs.readFileSync(targetPath, 'utf8');

    if (templateContent !== targetContent) {
      updates.push({ ...file, reason: 'updated in template', backup: true });
    }
  }

  if (updates.length === 0) {
    console.log(chalk.green('✓ All upgradeable files are up to date.'));
  } else {
    console.log(chalk.bold(`${updates.length} file(s) to upgrade:`));
    updates.forEach((u) =>
      console.log(`  ${chalk.cyan('→')} ${u.target} ${chalk.dim(`(${u.reason})`)}`),
    );
  }

  // Files the scaffold filled in: diff only, never written
  const patches = [];
  const absent = [];
  for (const file of REVIEW_DIFF_FILES) {
    const templatePath = path.join(TEMPLATES_DIR, file.template);
    const targetPath = path.join(cwd, file.target);

    if (!fs.existsSync(templatePath)) continue;

    const found = findTarget(targetPath);
    if (found === 'variant') {
      ownFiles.push(file.target);
      continue;
    }
    if (found === 'absent') {
      absent.push(file.target);
      continue;
    }

    const templateContent = fs.readFileSync(templatePath, 'utf8');
    const targetContent = fs.readFileSync(targetPath, 'utf8');
    if (templateContent !== targetContent) {
      patches.push({
        target: file.target,
        patch: createPatch(file.target, targetContent, templateContent, 'current', 'template'),
      });
    }
  }

  // Files that need manual review
  console.log();
  console.log(chalk.bold('Requires manual review (may contain your customizations):'));
  patches.forEach((p) =>
    console.log(`  ${chalk.yellow('⚠')} ${p.target} - differs from template, diff below`),
  );
  REVIEW_REQUIRED.forEach((f) => {
    const exists = fs.existsSync(path.join(cwd, f));
    if (exists) {
      console.log(`  ${chalk.yellow('⚠')} ${f} - compare with template manually`);
    }
  });

  if (patches.length > 0) {
    console.log();
    console.log(
      chalk.dim(
        'Upgrade never writes these files. Values filled in at init (commands, examples, libraries) and removed staging steps show up as differences: keep them, and copy only the template changes you want.',
      ),
    );
    for (const p of patches) {
      console.log();
      console.log(chalk.bold(`── ${p.target} ──`));
      process.stdout.write(colourizePatch(p.patch));
    }
  }

  if (ownFiles.length > 0) {
    console.log();
    console.log(chalk.bold('Your own files under another letter case (left untouched):'));
    ownFiles.forEach((f) => console.log(`  ${chalk.green('✓')} ${f}`));
  }

  if (absent.length > 0) {
    console.log();
    console.log(chalk.dim(`Not in this project, not added by upgrade: ${absent.join(', ')}`));
  }

  // Detect and report custom skills (custom-* prefix - never touched by upgrade)
  const customSkillsDir = path.join(cwd, '.claude', 'skills');
  if (fs.existsSync(customSkillsDir)) {
    const entries = fs.readdirSync(customSkillsDir, { withFileTypes: true });
    const customSkills = entries
      .filter((e) => e.isDirectory() && e.name.startsWith('custom-'))
      .map((e) => e.name);
    if (customSkills.length > 0) {
      console.log();
      console.log(chalk.bold('Custom skills (preserved - never modified by upgrade):'));
      customSkills.forEach((s) => console.log(`  ${chalk.green('✓')} .claude/skills/${s}/`));
    }
  }

  if (options.dryRun || updates.length === 0) {
    if (options.dryRun) console.log();
    if (options.dryRun) console.log(chalk.yellow('Dry run - no files written.'));
    return;
  }

  console.log();
  const now = new Date();
  for (const file of updates) {
    const templatePath = path.join(TEMPLATES_DIR, file.template);
    const targetPath = path.join(cwd, file.target);
    if (file.backup) {
      const backup = backupPath(targetPath, now);
      await fs.copy(targetPath, backup);
      console.log(`  ${chalk.dim('backup:')} ${backup}`);
    }
    await fs.ensureDir(path.dirname(targetPath));
    await fs.copy(templatePath, targetPath);
    console.log(`  ${chalk.green('✓')} Updated ${file.target}`);
  }

  console.log();
  console.log(chalk.green('Upgrade complete.'));
  console.log(chalk.dim('Review the manual-review files above to pick up any improvements.'));
  console.log();
  printStarCta();
}

/**
 * Refreshes the Anthropic-influenced files. Default behavior is dry-run with a
 * unified diff per changed file; `--apply` writes the new content with a
 * timestamped `.bak` backup of the previous version.
 *
 * Combines orthogonally with the standard upgrade flow above.
 */
async function runAnthropicUpgrade(cwd, options) {
  const tier = detectScaffoldedTier(cwd);
  if (!tier) {
    console.log(
      chalk.yellow(
        '⚠ No scaffolded tier detected (`.claude/rules/pipeline.md` missing or unrecognized). Skipping --anthropic refresh.',
      ),
    );
    return;
  }

  const changes = [];
  for (const entry of ANTHROPIC_FILES) {
    const templatePath = resolveTemplatePath(entry, tier);
    if (!templatePath || !fs.existsSync(templatePath)) continue;

    const targetPath = path.join(cwd, entry.target);
    const templateContent = fs.readFileSync(templatePath, 'utf8');

    if (!fs.existsSync(targetPath)) {
      changes.push({
        entry,
        templatePath,
        targetPath,
        templateContent,
        targetContent: '',
        reason: 'new file',
      });
      continue;
    }

    const targetContent = fs.readFileSync(targetPath, 'utf8');
    if (templateContent !== targetContent) {
      changes.push({
        entry,
        templatePath,
        targetPath,
        templateContent,
        targetContent,
        reason: 'updated in template',
      });
    }
  }

  if (changes.length === 0) {
    console.log(chalk.green('✓ Anthropic-influenced files are already current.'));
    return;
  }

  console.log(chalk.bold(`${changes.length} Anthropic-influenced file(s) differ from template:`));
  for (const c of changes) {
    console.log(`  ${chalk.cyan('→')} ${c.entry.target} ${chalk.dim(`(${c.reason})`)}`);
  }
  console.log();

  // Always show the diff (so the user can read what would change before applying)
  for (const c of changes) {
    const patch = createPatch(
      c.entry.target,
      c.targetContent,
      c.templateContent,
      'current',
      'template',
    );
    console.log(chalk.bold(`── ${c.entry.target} ──`));
    process.stdout.write(colourizePatch(patch));
    console.log();
  }

  if (!options.apply) {
    console.log(
      chalk.yellow(
        '⚠ Dry run. Re-run with `--anthropic --apply` to overwrite (a `.bak.<timestamp>` is created for each replaced file).',
      ),
    );
    return;
  }

  // --apply: write each change with backup
  const now = new Date();
  for (const c of changes) {
    if (c.targetContent !== '') {
      const backup = backupPath(c.targetPath, now);
      await fs.copy(c.targetPath, backup);
      console.log(`  ${chalk.dim('backup:')} ${backup}`);
    }
    await fs.ensureDir(path.dirname(c.targetPath));
    await fs.writeFile(c.targetPath, c.templateContent, 'utf8');
    console.log(`  ${chalk.green('✓')} Updated ${c.entry.target}`);
  }
  console.log();
  console.log(chalk.green('Anthropic refresh complete.'));
}

/**
 * Colourizes a unified diff produced by `diff.createPatch`. Lines that start
 * with `+` (additions) become green, `-` (removals) red, hunk headers cyan.
 * Other lines pass through unchanged.
 */
function colourizePatch(patch) {
  return patch
    .split('\n')
    .map((line) => {
      if (line.startsWith('+++') || line.startsWith('---')) return chalk.bold(line);
      if (line.startsWith('@@')) return chalk.cyan(line);
      if (line.startsWith('+')) return chalk.green(line);
      if (line.startsWith('-')) return chalk.red(line);
      return line;
    })
    .join('\n');
}
