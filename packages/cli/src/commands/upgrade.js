import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { createPatch } from 'diff';
import { violatesMinTier } from '../utils/team-settings.js';
import { loadTeamSettingsOrExit } from '../utils/team-settings-cli.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');

// Files that are safe to upgrade (non-destructive - they don't contain user content)
const UPGRADEABLE_FILES = [
  { template: 'common/context-review.md', target: '.claude/rules/context-review.md' },
  { template: 'common/rules/security.md', target: '.claude/rules/security.md' },
  { template: 'common/rules/git.md', target: '.claude/rules/git.md' },
  { template: 'common/rules/output-style.md', target: '.claude/rules/output-style.md' },
  { template: 'common/rules/claudemd-standards.md', target: '.claude/rules/claudemd-standards.md' },
  { template: 'common/rules/pipeline-standards.md', target: '.claude/rules/pipeline-standards.md' },
  { template: 'common/files-guide.md', target: '.claude/files-guide.md' },
  { template: 'common/PULL_REQUEST_TEMPLATE.md', target: '.github/PULL_REQUEST_TEMPLATE.md' },
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
  const updates = [];

  for (const file of UPGRADEABLE_FILES) {
    const templatePath = path.join(TEMPLATES_DIR, file.template);
    const targetPath = path.join(cwd, file.target);

    if (!fs.existsSync(templatePath)) continue;

    if (!fs.existsSync(targetPath)) {
      updates.push({ ...file, reason: 'new file' });
      continue;
    }

    const templateContent = fs.readFileSync(templatePath, 'utf8');
    const targetContent = fs.readFileSync(targetPath, 'utf8');

    if (templateContent !== targetContent) {
      updates.push({ ...file, reason: 'updated in template' });
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

  // Files that need manual review
  console.log();
  console.log(chalk.bold('Requires manual review (may contain your customizations):'));
  REVIEW_REQUIRED.forEach((f) => {
    const exists = fs.existsSync(path.join(cwd, f));
    if (exists) {
      console.log(`  ${chalk.yellow('⚠')} ${f} - compare with template manually`);
    }
  });

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
  for (const file of updates) {
    const templatePath = path.join(TEMPLATES_DIR, file.template);
    const targetPath = path.join(cwd, file.target);
    await fs.ensureDir(path.dirname(targetPath));
    await fs.copy(templatePath, targetPath);
    console.log(`  ${chalk.green('✓')} Updated ${file.target}`);
  }

  console.log();
  console.log(chalk.green('Upgrade complete.'));
  console.log(chalk.dim('Review the manual-review files above to pick up any improvements.'));
  console.log();
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
