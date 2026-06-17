import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { SKILL_REGISTRY } from '../scaffold/skill-registry.js';
import { registerSkillInClaudeMd } from '../utils/claudemd-update.js';
import { readTeamSettings, isSkillBlocked, isSkillAllowed } from '../utils/team-settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');

// Available rule names → source path relative to templates/common/rules/
const RULE_MAP = {
  git: 'git.md',
  'output-style': 'output-style.md',
  security: 'security.md', // base variant; resolved dynamically by --stack
};

// Security variant lookup by stack
const SECURITY_VARIANTS = {
  swift: 'security-native-apple.md',
  kotlin: 'security-native-android.md',
  rust: 'security-systems.md',
  dotnet: 'security-systems.md',
  java: 'security-systems.md',
  go: 'security-systems.md',
};

const VALID_SKILL_NAMES = SKILL_REGISTRY.map((s) => s.name);
const VALID_RULE_NAMES = Object.keys(RULE_MAP);

// ── add skill ────────────────────────────────────────────────────────────────

export async function addSkill(name, options) {
  const cwd = process.cwd();

  if (!name) {
    console.error(chalk.red('Missing skill name.'));
    console.log(`Available skills: ${VALID_SKILL_NAMES.join(', ')}`);
    process.exit(1);
  }

  if (!VALID_SKILL_NAMES.includes(name)) {
    console.error(chalk.red(`Unknown skill: ${name}`));
    console.log(`Available skills: ${VALID_SKILL_NAMES.join(', ')}`);
    process.exit(1);
  }

  // Require .claude/ directory (signals an initialized project)
  if (!fs.existsSync(path.join(cwd, '.claude'))) {
    console.error(chalk.red('No .claude/ directory found.'));
    console.log('Run ' + chalk.cyan('tierward init') + ' first, or create .claude/ manually.');
    process.exit(1);
  }

  let teamSettings = null;
  try {
    teamSettings = readTeamSettings(cwd);
  } catch (err) {
    console.error(chalk.red(`team-settings.json is invalid: ${err.message}`));
    process.exit(1);
  }

  if (isSkillBlocked(teamSettings, name)) {
    console.error(chalk.red(`✗ Skill ${name} is blocked by .claude/team-settings.json.`));
    console.error(
      `  Edit team-settings.json blockedSkills to allow it, or pick a different skill.`,
    );
    process.exit(1);
  }

  if (!isSkillAllowed(teamSettings, name)) {
    console.error(
      chalk.red(`✗ Skill ${name} is not in the allowedSkills list of .claude/team-settings.json.`),
    );
    console.error(
      `  Allowed: ${teamSettings.allowedSkills.join(', ')}. Custom skills (custom-*) bypass this check.`,
    );
    process.exit(1);
  }

  const targetPath = path.join(cwd, '.claude', 'skills', name, 'SKILL.md');

  // Conflict check
  if (fs.existsSync(targetPath) && !options.force) {
    console.log(chalk.yellow(`⚠ .claude/skills/${name}/SKILL.md already exists.`));
    console.log(`Use ${chalk.cyan('--force')} to overwrite.`);
    return;
  }

  // Source: use tier-m templates (full skill set, identical to tier-l)
  const sourcePath = path.join(TEMPLATES_DIR, 'tier-m', '.claude', 'skills', name, 'SKILL.md');

  if (!fs.existsSync(sourcePath)) {
    console.error(chalk.red(`Template not found: tier-m/.claude/skills/${name}/SKILL.md`));
    process.exit(1);
  }

  if (options.dryRun) {
    console.log(chalk.yellow('Dry run - no files written.'));
    console.log(`  Would create: .claude/skills/${name}/SKILL.md`);
    return;
  }

  // Copy skill file
  await fs.ensureDir(path.dirname(targetPath));
  await fs.copy(sourcePath, targetPath);
  console.log(`${chalk.green('✓')} Installed .claude/skills/${name}/SKILL.md`);

  // Append to CLAUDE.md Active Skills section if it exists
  const reg = registerSkillInClaudeMd(cwd, name);
  if (reg.updated) {
    console.log(`${chalk.green('✓')} Added /${name} to CLAUDE.md Active Skills`);
  }
}

// ── add rule ─────────────────────────────────────────────────────────────────

export async function addRule(name, options) {
  const cwd = process.cwd();

  if (!name) {
    console.error(chalk.red('Missing rule name.'));
    console.log(`Available rules: ${VALID_RULE_NAMES.join(', ')}`);
    process.exit(1);
  }

  if (!VALID_RULE_NAMES.includes(name)) {
    console.error(chalk.red(`Unknown rule: ${name}`));
    console.log(`Available rules: ${VALID_RULE_NAMES.join(', ')}`);
    process.exit(1);
  }

  // Resolve source file
  let sourceFile = RULE_MAP[name];

  if (name === 'security' && options.stack) {
    const variant = SECURITY_VARIANTS[options.stack];
    if (variant) {
      sourceFile = variant;
    }
    // If no variant match, use the web default (security.md)
  }

  const sourcePath = path.join(TEMPLATES_DIR, 'common', 'rules', sourceFile);
  // Target always named after the canonical rule (security.md, not security-native-apple.md)
  const targetPath = path.join(cwd, '.claude', 'rules', `${name}.md`);

  if (!fs.existsSync(sourcePath)) {
    console.error(chalk.red(`Template not found: common/rules/${sourceFile}`));
    process.exit(1);
  }

  // Conflict check
  if (fs.existsSync(targetPath) && !options.force) {
    console.log(chalk.yellow(`⚠ .claude/rules/${name}.md already exists.`));
    console.log(`Use ${chalk.cyan('--force')} to overwrite.`);
    return;
  }

  if (options.dryRun) {
    console.log(chalk.yellow('Dry run - no files written.'));
    console.log(`  Would create: .claude/rules/${name}.md`);
    if (name === 'security') {
      console.log(
        `  Variant: ${sourceFile}${options.stack ? ` (--stack ${options.stack})` : ' (web default)'}`,
      );
    }
    return;
  }

  // Copy rule file
  await fs.ensureDir(path.dirname(targetPath));
  await fs.copy(sourcePath, targetPath);

  const variantNote =
    name === 'security' && sourceFile !== 'security.md' ? ` (variant: ${sourceFile})` : '';
  console.log(`${chalk.green('✓')} Installed .claude/rules/${name}.md${variantNote}`);
}
