import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import inquirer from 'inquirer';
import { registerSkillInClaudeMd } from '../utils/claudemd-update.js';
import { SKILL_DESC_MAX_CHARS } from '../utils/constants.js';
import { parseSkillFile } from '../utils/skill-frontmatter.js';

// Standard Playwright MCP tools (sourced from visual-audit SKILL.md)
const PLAYWRIGHT_TOOLS = [
  'Read',
  'Glob',
  'Grep',
  'Bash',
  'mcp__playwright__browser_navigate',
  'mcp__playwright__browser_take_screenshot',
  'mcp__playwright__browser_snapshot',
  'mcp__playwright__browser_click',
  'mcp__playwright__browser_type',
  'mcp__playwright__browser_wait_for',
  'mcp__playwright__browser_resize',
  'mcp__playwright__browser_evaluate',
].join(', ');

const NAME_RE = /^custom-[a-z][a-z0-9-]{1,37}$/;

// ── helpers ─────────────────────────────────────────────────────────────────

function normalizeName(raw) {
  let name = raw.trim().toLowerCase().replace(/\s+/g, '-');
  if (!name.startsWith('custom-')) name = `custom-${name}`;
  return name;
}

function buildSkillMd(answers) {
  const lines = ['---'];
  lines.push(`name: ${answers.name}`);
  lines.push(`description: ${answers.description}`);
  lines.push(`user-invocable: ${answers.userInvocable !== false}`);
  lines.push(`model: ${answers.model || 'sonnet'}`);
  lines.push('context: fork');
  if (answers.effort && answers.effort !== '(skip)') {
    lines.push(`effort: ${answers.effort}`);
  }
  if (answers.argumentHint) {
    lines.push(`argument-hint: ${answers.argumentHint}`);
  }
  if (answers.allowedTools) {
    lines.push(`allowed-tools: ${answers.allowedTools}`);
  }
  lines.push('---');
  lines.push('');
  lines.push('**Scope**: [What this skill covers.]');
  lines.push('**Out of scope**: [What it does NOT cover.]');

  const count = Number(answers.stepCount) || 3;
  for (let i = 1; i <= count; i++) {
    lines.push('');
    if (i === count) {
      lines.push(`## Step ${i} - Produce report`);
      lines.push('');
      lines.push('[Define the output format. Structured reports work better than prose.]');
    } else {
      lines.push(`## Step ${i} - [action]`);
      lines.push('');
      lines.push(
        '[Instructions for Claude. Be specific - include file paths, commands, decision criteria.]',
      );
    }
  }
  lines.push('');

  return lines.join('\n');
}

function buildTestFixture(name) {
  return `// Validates SKILL.md structure for ${name}
// Run: node .claude/skills/${name}/test-skill.js
import { readFileSync } from 'fs';
import { strict as assert } from 'assert';

const content = readFileSync(new URL('./SKILL.md', import.meta.url), 'utf8');
const [, frontmatter] = content.match(/^---\\n([\\s\\S]*?)\\n---/) || [];

assert.ok(frontmatter, 'SKILL.md must have YAML frontmatter');
assert.ok(frontmatter.includes('name:'), 'frontmatter must include name');
assert.ok(frontmatter.includes('description:'), 'frontmatter must include description');
assert.ok(frontmatter.includes('context: fork'), 'context must be fork');

const desc = frontmatter.match(/description:\\s*(.+)/)?.[1] || '';
assert.ok(desc.length <= ${SKILL_DESC_MAX_CHARS}, \`description too long: \${desc.length}/${SKILL_DESC_MAX_CHARS}\`);

if (content.includes('browser_')) {
  assert.ok(frontmatter.includes('allowed-tools'), 'Playwright skills must declare allowed-tools');
}

console.log('\\u2713 SKILL.md structure valid');
`;
}

function validateSkillMd(content, dirName) {
  const errors = [];
  const warnings = [];

  const { frontmatter, body, fields } = parseSkillFile(content);
  if (frontmatter === null) {
    errors.push('Missing YAML frontmatter (--- delimiters)');
    return { errors, warnings };
  }

  if (fields.name && fields.name !== dirName) {
    errors.push(`name field "${fields.name}" does not match directory "${dirName}"`);
  }

  if (fields.description) {
    const desc = fields.description;
    if (desc.length > SKILL_DESC_MAX_CHARS) {
      errors.push(`Description too long: ${desc.length}/${SKILL_DESC_MAX_CHARS} chars`);
    } else if (desc.length < 10) {
      warnings.push(`Description very short: ${desc.length} chars (min recommended: 10)`);
    }
  }

  if (fields.context !== 'fork') {
    warnings.push('context should be "fork" to prevent context pollution');
  }

  if (body.includes('browser_') && !fields.allowedTools) {
    warnings.push('Body references browser_ but frontmatter lacks allowed-tools');
  }

  return { errors, warnings };
}

// ── command handler ─────────────────────────────────────────────────────────

export async function newSkill(options) {
  const cwd = process.cwd();

  // Require .claude/ directory
  if (!fs.existsSync(path.join(cwd, '.claude'))) {
    console.error(chalk.red('No .claude/ directory found.'));
    console.log(
      'Run ' + chalk.cyan('claude-dev-kit init') + ' first, or create .claude/ manually.',
    );
    process.exit(1);
  }

  // Collect answers
  let answers;
  if (options.answers) {
    try {
      answers = JSON.parse(options.answers);
    } catch {
      console.error(chalk.red('Invalid JSON in --answers.'));
      process.exit(1);
    }
  } else {
    const prompts = [];

    if (!options.name) {
      prompts.push({
        type: 'input',
        name: 'name',
        message: 'Skill name (custom- prefix added automatically):',
        validate: (v) => {
          const n = normalizeName(v);
          return NAME_RE.test(n) || 'Use lowercase letters, numbers, and hyphens (2-40 chars).';
        },
      });
    }

    prompts.push(
      {
        type: 'input',
        name: 'description',
        message: `One-line description (max ${SKILL_DESC_MAX_CHARS} chars):`,
        validate: (v) => {
          if (!v || v.trim().length < 10) return 'Description must be at least 10 characters.';
          if (v.trim().length > SKILL_DESC_MAX_CHARS)
            return `Too long: ${v.trim().length}/${SKILL_DESC_MAX_CHARS} chars.`;
          return true;
        },
      },
      {
        type: 'list',
        name: 'model',
        message: 'Model:',
        choices: [
          { name: 'haiku  - fast, pattern-matching, grep-based checks', value: 'haiku' },
          { name: 'sonnet - balanced analysis, multi-file reasoning', value: 'sonnet' },
          { name: 'opus   - visual analysis, complex architectural reasoning', value: 'opus' },
        ],
        default: 'sonnet',
      },
      {
        type: 'confirm',
        name: 'userInvocable',
        message: 'Can users invoke this skill directly with /name?',
        default: true,
      },
      {
        type: 'list',
        name: 'effort',
        message: 'Expected effort level:',
        choices: [
          { name: 'low    - quick checks, single file', value: 'low' },
          { name: 'medium - multi-file analysis', value: 'medium' },
          { name: 'high   - deep audit, subagent delegation', value: 'high' },
          { name: '(skip) - omit from frontmatter', value: '(skip)' },
        ],
        default: 'medium',
      },
      {
        type: 'input',
        name: 'argumentHint',
        message: 'Argument hint (e.g. [quick|full]) - leave blank for none:',
        default: '',
      },
      {
        type: 'confirm',
        name: 'usesPlaywright',
        message: 'Will this skill use Playwright (browser screenshots, navigation)?',
        default: false,
      },
      {
        type: 'input',
        name: 'allowedTools',
        message: 'Allowed tools (comma-separated MCP tool names):',
        default: PLAYWRIGHT_TOOLS,
        when: (a) => a.usesPlaywright,
      },
      {
        type: 'list',
        name: 'stepCount',
        message: 'Number of steps in the skill:',
        choices: ['2', '3', '4', '5'],
        default: '3',
      },
    );

    answers = await inquirer.prompt(prompts);
    if (options.name) answers.name = options.name;
  }

  // Normalize name
  answers.name = normalizeName(answers.name);

  if (!NAME_RE.test(answers.name)) {
    console.error(
      chalk.red(`Invalid skill name: ${answers.name}. Use lowercase letters, numbers, hyphens.`),
    );
    process.exit(1);
  }

  const targetDir = path.join(cwd, '.claude', 'skills', answers.name);
  const targetSkill = path.join(targetDir, 'SKILL.md');

  // Build content
  const skillContent = buildSkillMd(answers);
  const testContent = buildTestFixture(answers.name);

  // Validate
  const { errors, warnings } = validateSkillMd(skillContent, answers.name);
  if (errors.length > 0) {
    console.error(chalk.red('Validation errors:'));
    errors.forEach((e) => console.error(`  ${chalk.red('✗')} ${e}`));
    process.exit(1);
  }

  // Dry run
  if (options.dryRun) {
    console.log(chalk.yellow('Dry run - no files written.'));
    console.log(`  Would create: .claude/skills/${answers.name}/SKILL.md`);
    console.log(`  Would create: .claude/skills/${answers.name}/test-skill.js`);
    console.log(`  Would register: /${answers.name} in CLAUDE.md Active Skills`);
    return;
  }

  // Write files — flag 'wx' fails atomically if SKILL.md already exists,
  // closing the check/write race window CodeQL flags as js/file-system-race.
  await fs.ensureDir(targetDir);
  try {
    await fs.writeFile(targetSkill, skillContent, { flag: 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') {
      console.log(chalk.yellow(`⚠ .claude/skills/${answers.name}/SKILL.md already exists.`));
      console.log('Remove it first or choose a different name.');
      return;
    }
    throw err;
  }
  console.log(`${chalk.green('✓')} Created .claude/skills/${answers.name}/SKILL.md`);

  const targetTest = path.join(targetDir, 'test-skill.js');
  await fs.writeFile(targetTest, testContent);
  console.log(`${chalk.green('✓')} Created .claude/skills/${answers.name}/test-skill.js`);

  // Register in CLAUDE.md
  const reg = registerSkillInClaudeMd(cwd, answers.name, answers.description);
  if (reg.updated) {
    console.log(`${chalk.green('✓')} Added /${answers.name} to CLAUDE.md Active Skills`);
  } else if (reg.reason === 'CLAUDE.md not found') {
    console.log(
      chalk.dim(`  No CLAUDE.md found - add /${answers.name} to Active Skills manually.`),
    );
  }

  // Validation summary
  if (warnings.length > 0) {
    console.log();
    warnings.forEach((w) => console.log(`  ${chalk.yellow('⚠')} ${w}`));
  }
  console.log(`  Validation: ${errors.length} errors, ${warnings.length} warnings`);

  // Next steps
  console.log();
  console.log(chalk.dim('Next steps:'));
  console.log(
    chalk.dim(`  1. Edit .claude/skills/${answers.name}/SKILL.md - fill in the step instructions`),
  );
  console.log(chalk.dim(`  2. Test: invoke /${answers.name} in Claude Code`));
  console.log(chalk.dim(`  3. Validate: node .claude/skills/${answers.name}/test-skill.js`));
}

// Export internals for testing
export const _testHelpers = { normalizeName, buildSkillMd, buildTestFixture, validateSkillMd };
