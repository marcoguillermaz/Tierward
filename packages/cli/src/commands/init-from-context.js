import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { cloneRepo } from '../utils/clone-repo.js';
import { scaffoldTierSafe } from '../scaffold/index.js';
import { generateContextImport } from '../generators/context-import.js';
import { printPlan, printNextSteps } from '../utils/print-plan.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');

export async function initFromContext(options) {
  console.log();
  console.log(
    chalk.dim(
      'Provide existing repos and/or docs. Claude will read them and populate your project files.',
    ),
  );
  console.log();

  // ── Collect source repos ─────────────────────────────────────────────

  const sourceInputs = [];
  console.log(
    chalk.bold('Source repositories') +
      chalk.dim(' (GitHub URL, org/repo, or local path - empty line when done):'),
  );

  while (true) {
    const { source } = await inquirer.prompt([
      {
        type: 'input',
        name: 'source',
        message: `  Repo ${sourceInputs.length + 1}:`,
        validate: (v) => {
          if (sourceInputs.length === 0 && v.trim() === '')
            return 'At least one repository is required';
          return true;
        },
      },
    ]);

    if (source.trim() === '') break;
    sourceInputs.push(source.trim());
  }

  // ── Collect source docs ──────────────────────────────────────────────

  console.log();
  console.log(
    chalk.bold('Source documents') +
      chalk.dim(' (PDF, MD, TXT file paths - optional, empty line when done):'),
  );

  const docInputs = [];
  while (true) {
    const { doc } = await inquirer.prompt([
      {
        type: 'input',
        name: 'doc',
        message: `  Doc ${docInputs.length + 1}:`,
      },
    ]);
    if (doc.trim() === '') break;

    const resolved = doc.startsWith('~')
      ? path.join(process.env.HOME || '~', doc.slice(1))
      : path.resolve(doc);

    if (!(await fs.pathExists(resolved))) {
      console.log(chalk.yellow(`  ⚠ File not found: ${resolved} - skipping`));
      continue;
    }
    docInputs.push(resolved);
  }

  // ── Primary repo + project config ───────────────────────────────────

  const { projectName, primaryRepo, tier, includePreCommit, includeGithub } = await inquirer.prompt(
    [
      {
        type: 'input',
        name: 'projectName',
        message: 'New project name:',
        default: path.basename(
          sourceInputs[0]
            ?.split('/')
            .pop()
            ?.replace(/\.git$/, '') || process.cwd(),
        ),
        validate: (v) => v.trim().length > 0 || 'Required',
      },
      {
        type: 'select',
        name: 'primaryRepo',
        message: 'Which is the primary repository?',
        when: sourceInputs.length > 1,
        choices: sourceInputs,
      },
      {
        type: 'select',
        name: 'tier',
        message: 'Pipeline tier:',
        when: !options.tier,
        choices: [
          { name: 'S - Fast Lane    (bugfixes, ≤3 files)', value: 's' },
          { name: 'M - Standard     (feature blocks, 1–2 weeks)', value: 'm' },
          { name: 'L - Full         (complex domain, long-running)', value: 'l' },
        ],
      },
      {
        type: 'confirm',
        name: 'includePreCommit',
        message: 'Include pre-commit config?',
        default: true,
      },
      {
        type: 'confirm',
        name: 'includeGithub',
        message: 'Include .github/ (PR template + CODEOWNERS)?',
        default: true,
      },
    ],
  );

  const config = {
    projectName,
    tier: options.tier || tier,
    primaryRepo: primaryRepo || sourceInputs[0],
    includePreCommit,
    includeGithub,
    mode: 'from-context',
    sourceRepos: [],
    sourceDocs: [],
  };

  if (options.dryRun) {
    console.log();
    console.log(chalk.yellow('Dry run - no files will be written.'));
    console.log();
    config.sourceRepos = sourceInputs.map((s) => ({ source: s }));
    config.sourceDocs = docInputs;
    printPlan(config);
    return;
  }

  // ── Target directory ─────────────────────────────────────────────────

  const targetDir = path.join(process.cwd(), projectName);

  if (await fs.pathExists(targetDir)) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: `Directory '${projectName}' already exists. Continue and add files into it?`,
        default: false,
      },
    ]);
    if (!overwrite) {
      console.log(chalk.dim('Aborted.'));
      process.exit(0);
    }
  }

  await fs.ensureDir(targetDir);
  const contextDir = path.join(targetDir, '.claude', 'context');

  // ── Clone repos ───────────────────────────────────────────────────────

  const spinner = ora('Setting up context...').start();
  const clonedRepos = [];

  for (const source of sourceInputs) {
    const repoName = source
      .split('/')
      .pop()
      .replace(/\.git$/, '');
    const repoTarget = path.join(contextDir, 'repos', repoName);
    spinner.text = `Cloning ${repoName}...`;
    try {
      const result = await cloneRepo(source, repoTarget);
      clonedRepos.push(result);
    } catch (err) {
      spinner.warn(`Could not clone ${source}: ${err.message}`);
      clonedRepos.push({ name: repoName, path: repoTarget, source, error: err.message });
    }
  }

  // ── Copy docs ─────────────────────────────────────────────────────────

  const copiedDocs = [];
  if (docInputs.length > 0) {
    const docsContextDir = path.join(contextDir, 'docs');
    await fs.ensureDir(docsContextDir);

    for (const docPath of docInputs) {
      const destName = path.basename(docPath);
      const dest = path.join(docsContextDir, destName);
      await fs.copy(docPath, dest);
      copiedDocs.push(dest);
      spinner.text = `Copied ${destName}`;
    }
  }

  // ── Scaffold base structure ───────────────────────────────────────────

  spinner.text = 'Scaffolding governance structure...';
  config.sourceRepos = clonedRepos;
  config.sourceDocs = copiedDocs;

  try {
    await scaffoldTierSafe(config.tier, targetDir, config, TEMPLATES_DIR);
  } catch (err) {
    spinner.fail('Scaffolding failed.');
    console.error(chalk.red(err.message));
    process.exit(1);
  }

  // ── Generate CONTEXT_IMPORT.md ────────────────────────────────────────

  await generateContextImport(config, targetDir, clonedRepos, copiedDocs);

  // Add .claude/context to gitignore (repos can be large)
  await appendToGitignore(targetDir, ['.claude/context/', 'CONTEXT_IMPORT.md']);

  spinner.succeed('Context setup complete.');

  // ── Summary ──────────────────────────────────────────────────────────

  console.log();
  console.log(chalk.green.bold('✓ From-context scaffold complete'));
  console.log();
  printPlan(config);
  console.log();
  console.log(chalk.bold('Next steps:'));
  printNextSteps(config);
  console.log();
  console.log(
    chalk.yellow.bold('Important:') +
      ' CONTEXT_IMPORT.md is added to .gitignore - it contains local paths.',
  );
  console.log(chalk.dim('Docs: https://marcoguillermaz.github.io/Tierward/'));
}

async function appendToGitignore(dir, entries) {
  const gitignorePath = path.join(dir, '.gitignore');
  let content = '';

  if (await fs.pathExists(gitignorePath)) {
    content = await fs.readFile(gitignorePath, 'utf8');
  }

  const toAdd = entries.filter((e) => !content.includes(e));
  if (toAdd.length > 0) {
    const additions = '\n# tierward context import\n' + toAdd.join('\n') + '\n';
    await fs.appendFile(gitignorePath, additions);
  }
}
