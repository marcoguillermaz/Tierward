import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { cloneRepo } from '../utils/clone-repo.js';
import { scaffoldTierSafe } from '../scaffold/index.js';
import { promotionError } from '../scaffold/skill-registry.js';
import { generateContextImport } from '../generators/context-import.js';
import { printPlan, printNextSteps } from '../utils/print-plan.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');
const FROM_CONTEXT_TIERS = ['s', 'm', 'l'];

function refuse(message) {
  console.error(chalk.red(message));
  process.exit(1);
}

function resolveDoc(doc) {
  return doc.startsWith('~') ? path.join(process.env.HOME || '~', doc.slice(1)) : path.resolve(doc);
}

// The project name a source suggests: its last path segment, trailing slashes
// and a `.git` suffix dropped. '' when the source has no segment (`/`).
function projectNameFromSource(source) {
  return String(source)
    .replace(/\/+$/, '')
    .split('/')
    .pop()
    .replace(/\.git$/, '');
}

// The values `--answers` (or a CONTEXT.md, which init turns into answers)
// gives: no prompt is asked. `sourceRepos` and `sourceDocs` are the repository
// and document inputs, `primaryRepo` the main repository.
async function valuesFromAnswers(answers, options) {
  const sourceInputs = (Array.isArray(answers.sourceRepos) ? answers.sourceRepos : [])
    .map((s) => String(s).trim())
    .filter(Boolean);
  if (sourceInputs.length === 0) {
    refuse(
      'From existing docs needs at least one source repository: set `sourceRepos` in --answers, or `sources.primary_repo` in CONTEXT.md.',
    );
  }
  const docInputs = [];
  for (const doc of Array.isArray(answers.sourceDocs) ? answers.sourceDocs : []) {
    const resolved = resolveDoc(String(doc));
    if (await fs.pathExists(resolved)) docInputs.push(resolved);
    else console.log(chalk.yellow(`  ⚠ File not found: ${resolved} - skipping`));
  }
  const projectName =
    String(answers.projectName || '').trim() || projectNameFromSource(sourceInputs[0]);
  if (!projectName) {
    refuse(
      `From existing docs cannot name the project after the source '${sourceInputs[0]}': set \`projectName\` in --answers.`,
    );
  }
  return {
    sourceInputs,
    docInputs,
    projectName,
    primaryRepo: answers.primaryRepo || sourceInputs[0],
    tier: options.tier || answers.tier || 's',
    includePreCommit: answers.includePreCommit ?? true,
    includeGithub: answers.includeGithub ?? true,
  };
}

export async function initFromContext(options) {
  const answers = options.answers ? JSON.parse(options.answers) : null;
  const values = answers ? await valuesFromAnswers(answers, options) : await promptValues(options);
  const { sourceInputs, docInputs, projectName, primaryRepo, includePreCommit, includeGithub } =
    values;
  const tier = String(values.tier).toLowerCase();
  if (!FROM_CONTEXT_TIERS.includes(tier)) {
    refuse(`From existing docs scaffolds tier S, M or L, not "${values.tier}".`);
  }

  const config = {
    ...(answers || {}),
    projectName,
    tier,
    primaryRepo,
    includePreCommit,
    includeGithub,
    mode: 'from-context',
    sourceRepos: [],
    sourceDocs: [],
  };
  // Checked here because the target directory and the source copies are
  // written before the scaffold runs its own check
  const invalidPromotion = promotionError(config);
  if (invalidPromotion) refuse(invalidPromotion);

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
    // With answers there is no one to ask, and the prompt's default is "no"
    if (answers) {
      refuse(`Directory '${projectName}' already exists. Remove it or choose another projectName.`);
    }
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

  await scaffoldFromSources(config, targetDir, sourceInputs, docInputs);
}

async function promptValues(options) {
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

    const resolved = resolveDoc(doc);

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
          (sourceInputs[0] && projectNameFromSource(sourceInputs[0])) || process.cwd(),
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

  return {
    sourceInputs,
    docInputs,
    projectName,
    primaryRepo: primaryRepo || sourceInputs[0],
    tier: options.tier || tier,
    includePreCommit,
    includeGithub,
  };
}

async function scaffoldFromSources(config, targetDir, sourceInputs, docInputs) {
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
