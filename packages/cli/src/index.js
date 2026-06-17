#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { program } from 'commander';
import { init } from './commands/init.js';
import { contextCommand } from './commands/context.js';
import { validateContext } from './commands/validate-context.js';
import { doctor } from './commands/doctor.js';
import { upgrade } from './commands/upgrade.js';
import { addSkill, addRule } from './commands/add.js';
import { newSkill } from './commands/new-skill.js';
import chalk from 'chalk';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

program
  .name('tierward')
  .description('Scaffold for legible, reviewable AI-assisted development')
  .version(pkg.version);

program
  .command('init')
  .description('Initialize a new project with a legible, reviewable development scaffold')
  .option('--tier <tier>', 'Skip tier selection prompt (s, m, or l)')
  .option('--dry-run', 'Show what would be created without writing any files')
  .option(
    '--answers <json>',
    'Bypass interactive prompts with JSON answers (for automation and testing)',
  )
  .option(
    '--ignore-context',
    'Skip auto-detection of CONTEXT.md in the current directory (prompt as usual)',
  )
  .action(init);

program
  .command('context')
  .description('Generate CONTEXT.md (project context file consumed by `init`)')
  .option('--mode <mode>', 'Override mode auto-detection (greenfield|in-place|from-context)')
  .option('--skip-llm', 'Skip Phase 2 LLM extraction (offline runs)')
  .option('--all', 'Auto-chain `init` after writing CONTEXT.md')
  .option(
    '--from-yaml <file>',
    'Skip interview/inference: validate and copy an existing CONTEXT.md or YAML config into cwd',
  )
  .action(contextCommand);

program
  .command('validate-context [file]')
  .description('Validate a CONTEXT.md against schema v1 (defaults to ./CONTEXT.md)')
  .option('--json', 'Emit machine-readable JSON instead of human-readable output')
  .action(validateContext);

program
  .command('doctor')
  .description('Validate the Claude Code setup in the current project')
  .option('--report', 'Output machine-readable JSON compliance report (for CI)')
  .option('--ci', 'Silent mode: exit 1 if any check fails, no interactive output')
  .action(doctor);

program
  .command('upgrade')
  .description('Update template files to the latest claude-dev-kit version')
  .option('--dry-run', 'Show what would change without writing any files')
  .option(
    '--anthropic',
    'Also refresh files that encode Anthropic spec / best practices (currently arch-audit/advanced-checks.md; v1.15.0 scope)',
  )
  .option(
    '--apply',
    'Required with --anthropic: write changes to disk (default is dry-run with diff)',
  )
  .action(upgrade);

const add = program.command('add').description('Add a single skill or rule to the current project');

add
  .command('skill <name>')
  .description('Install a skill (e.g. arch-audit, security-audit, api-design)')
  .option('--force', 'Overwrite if the skill already exists')
  .option('--dry-run', 'Show what would be created without writing files')
  .action(addSkill);

add
  .command('rule <name>')
  .description('Install a rule (e.g. git, output-style, security)')
  .option(
    '--stack <stack>',
    'Tech stack for security variant (swift, kotlin, rust, dotnet, java, go)',
  )
  .option('--force', 'Overwrite if the rule already exists')
  .option('--dry-run', 'Show what would be created without writing files')
  .action(addRule);

const newCmd = program.command('new').description('Create a new custom resource from scratch');

newCmd
  .command('skill')
  .description('Create a custom skill with an interactive wizard')
  .option('--name <name>', 'Skill name (auto-prepends custom- if missing)')
  .option('--dry-run', 'Show what would be created without writing files')
  .option('--answers <json>', 'Bypass prompts with JSON answers (for testing)')
  .action(newSkill);

program.on('command:*', () => {
  console.error(chalk.red(`Unknown command: ${program.args.join(' ')}`));
  console.log(`Run ${chalk.cyan('claude-dev-kit --help')} for available commands.`);
  process.exit(1);
});

program.parse();
