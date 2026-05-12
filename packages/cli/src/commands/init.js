import path from 'node:path';
import fs from 'fs-extra';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { initGreenfield } from './init-greenfield.js';
import { initFromContext } from './init-from-context.js';
import { initInPlace } from './init-in-place.js';
import { validateContextFile } from '../utils/validate-context.js';

const CONTEXT_FILENAME = 'CONTEXT.md';

export async function init(options) {
  console.log();
  console.log(
    chalk.bold('claude-dev-kit') +
      chalk.dim(' - rules, workflows, and pipeline templates for Claude Code'),
  );
  console.log();
  console.log(chalk.dim('  Sets up your project so Claude works consistently from day one.'));
  console.log(chalk.dim('  Takes ~2 minutes. You can edit everything after.'));
  console.log();

  // ── Detect CONTEXT.md and prefer it ─────────────────────────────────
  // When CONTEXT.md exists in cwd, read it and scaffold deterministically
  // without further prompts. Pass --ignore-context to bypass.
  const contextPath = path.join(process.cwd(), CONTEXT_FILENAME);
  if (!options.ignoreContext && (await fs.pathExists(contextPath))) {
    console.log(chalk.cyan(`Found ${CONTEXT_FILENAME} — scaffold will be deterministic.`));
    const result = validateContextFile(contextPath);
    if (!result.valid) {
      console.error(chalk.red(`${CONTEXT_FILENAME} validation failed:`));
      for (const err of result.errors) {
        console.error(`  ${err.path.join('.') || '(root)'}: ${err.message}`);
      }
      console.error();
      console.error(
        chalk.yellow('Fix the file, regenerate via `context`, or run with --ignore-context.'),
      );
      process.exit(1);
    }
    return dispatchFromContext(result.data, options);
  }

  let mode;
  if (options.answers) {
    mode = JSON.parse(options.answers).mode;
  } else {
    ({ mode } = await inquirer.prompt([
      {
        type: 'list',
        name: 'mode',
        message: "What's the state of this project?",
        choices: [
          {
            name: 'Existing project - add CDK to a project that already has code',
            value: 'in-place',
          },
          {
            name: "New project - starting from scratch, you'll fill in the details",
            value: 'greenfield',
          },
          {
            name: 'From existing docs - share your docs and Claude populates everything',
            value: 'from-context',
          },
        ],
      },
    ]));
  }

  switch (mode) {
    case 'greenfield':
      return initGreenfield(options);
    case 'from-context':
      return initFromContext(options);
    case 'in-place':
      return initInPlace(options);
  }
}

/**
 * Convert a validated CONTEXT.md frontmatter into options for the
 * legacy init-* sub-flows, then dispatch. Lets us reuse the existing
 * scaffolding code paths during the v1 → v2 migration.
 */
async function dispatchFromContext(data, options) {
  const answersFromContext = {
    mode: data.project.mode,
    projectName: data.project.name,
    description: data.project.description,
    tier: data.tier.selected,
    techStack: data.stack.primary,
    installCommand: data.commands.install,
    testCommand: data.commands.test,
    typeCheckCommand: data.commands.type_check ?? '',
    devCommand: data.commands.dev ?? '',
    includePreCommit: data.scaffold_options.include_pre_commit,
    includeGithub: data.scaffold_options.include_github,
  };
  const passthrough = { ...options, answers: JSON.stringify(answersFromContext) };
  switch (data.project.mode) {
    case 'greenfield':
      return initGreenfield(passthrough);
    case 'from-context':
      return initFromContext(passthrough);
    case 'in-place':
      return initInPlace(passthrough);
    default:
      throw new Error(`Unknown mode in CONTEXT.md: ${data.project.mode}`);
  }
}
