import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { detectStack } from '../utils/detect-stack.js';
import { enforceTeamSettingsTier } from '../utils/team-settings-cli.js';
import { scaffoldTierSafe } from '../scaffold/index.js';
import { generateClaudeMd } from '../generators/claude-md.js';
import { generateContextImport } from '../generators/context-import.js';
import { printPlan, printNextSteps, printStarCta } from '../utils/print-plan.js';
import { AUDIT_MODELS } from '../utils/constants.js';
import { NATIVE_STACKS, WEB_STACKS } from '../scaffold/skill-registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');

export async function initInPlace(options) {
  const cwd = process.cwd();

  let answers;
  let detected = {};

  if (options.answers) {
    answers = JSON.parse(options.answers);
  } else {
    console.log();
    console.log(chalk.dim(`Analyzing ${path.basename(cwd)}...`));

    // ── Auto-detect stack ──────────────────────────────────────────────

    detected = await detectStack(cwd);

    if (detected.detectedFiles.length > 0) {
      console.log(chalk.dim(`  Detected: ${detected.detectedFiles.join(', ')}`));
    } else {
      console.log(chalk.dim("  No stack detected - you'll confirm the details below."));
    }

    let hasGithubRemote = false;
    try {
      const remotes = execSync('git remote -v', { cwd, stdio: 'pipe' }).toString();
      hasGithubRemote = /(?:^|[@/])github\.com[:/]/.test(remotes);
    } catch {
      // not a git repo or git unavailable
    }

    // ── Confirmation wizard ────────────────────────────────────────────

    const tierDefault = detected.suggestedTier || 'm';
    const tierLabels = { s: 'Fast Lane', m: 'Standard', l: 'Full' };

    console.log();

    answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: 'Project name:',
        default: path.basename(cwd),
      },
      {
        type: 'select',
        name: 'techStack',
        message:
          detected.techStack !== 'other'
            ? 'Tech stack (detected - confirm or change):'
            : 'Tech stack:',
        default: detected.techStack,
        choices: [
          {
            name: `Node.js / TypeScript${detected.techStack === 'node-ts' ? chalk.dim(' (detected)') : ''}`,
            value: 'node-ts',
          },
          {
            name: `Node.js / JavaScript${detected.techStack === 'node-js' ? chalk.dim(' (detected)') : ''}`,
            value: 'node-js',
          },
          {
            name: `Python${detected.techStack === 'python' ? chalk.dim(' (detected)') : ''}`,
            value: 'python',
          },
          { name: `Go${detected.techStack === 'go' ? chalk.dim(' (detected)') : ''}`, value: 'go' },
          {
            name: `Swift / macOS / iOS${detected.techStack === 'swift' ? chalk.dim(' (detected)') : ''}`,
            value: 'swift',
          },
          {
            name: `Kotlin / Android${detected.techStack === 'kotlin' ? chalk.dim(' (detected)') : ''}`,
            value: 'kotlin',
          },
          {
            name: `Rust${detected.techStack === 'rust' ? chalk.dim(' (detected)') : ''}`,
            value: 'rust',
          },
          {
            name: `.NET / C#${detected.techStack === 'dotnet' ? chalk.dim(' (detected)') : ''}`,
            value: 'dotnet',
          },
          {
            name: `Ruby${detected.techStack === 'ruby' ? chalk.dim(' (detected)') : ''}`,
            value: 'ruby',
          },
          {
            name: `Java${detected.techStack === 'java' ? chalk.dim(' (detected)') : ''}`,
            value: 'java',
          },
          { name: 'Other / mixed', value: 'other' },
        ],
      },
      {
        type: 'input',
        name: 'testCommand',
        message: "Test command (reference only - Tierward won't run it):",
        default: (a) => {
          if (a.techStack === 'other') return '';
          if (detected.testCommand) return detected.testCommand;
          const nativeDefaults = {
            swift: `xcodebuild test -scheme ${a.projectName}`,
            kotlin: './gradlew test',
            rust: 'cargo test',
            dotnet: 'dotnet test',
            java: 'mvn test',
          };
          return nativeDefaults[a.techStack] || 'npm test';
        },
      },
      {
        type: 'input',
        name: 'typeCheckCommand',
        message: 'Type check command (blank if none):',
        default: detected.typeCheckCommand || '',
        when: (a) => ['node-ts', 'node-js'].includes(a.techStack),
      },
      {
        type: 'input',
        name: 'devCommand',
        message: (a) => {
          const isNative = NATIVE_STACKS.includes(a.techStack);
          return isNative
            ? 'Launch command (optional, leave blank to skip):'
            : 'Dev server command:';
        },
        default: (a) => {
          const nativeDefaults = {
            swift: 'swift run',
            kotlin: './gradlew run',
            rust: 'cargo run',
            dotnet: 'dotnet run',
            java: 'mvn exec:java',
          };
          return detected.devCommand !== null
            ? detected.devCommand
            : nativeDefaults[a.techStack] || '';
        },
      },
      {
        type: 'select',
        name: 'tier',
        message: `Pipeline tier (suggested: ${tierDefault.toUpperCase()} - ${tierLabels[tierDefault]}${detected.detectedFiles.length > 0 ? ', based on project size' : ''}):`,
        when: !options.tier,
        default: tierDefault,
        choices: [
          { name: '0 - Discovery (context only, no pipeline)', value: '0' },
          { name: 'S - Fast Lane (bugfixes, ≤3 files)', value: 's' },
          { name: 'M - Standard (feature blocks, 1–2 weeks)', value: 'm' },
          { name: 'L - Full (complex domain, long-running)', value: 'l' },
        ],
      },
      {
        type: 'confirm',
        name: 'hasPrd',
        message: 'Track a PRD per feature block? (adds a PRD template to each block)',
        when: (a) => {
          const tier = options.tier || a.tier;
          return tier === 'm' || tier === 'l';
        },
        default: false,
      },
      {
        type: 'input',
        name: 'e2eCommand',
        message: (a) => {
          const webStacks = WEB_STACKS;
          if (webStacks.includes(a.techStack)) {
            return 'E2E test command (Playwright/Cypress - reference only, leave blank to skip):';
          }
          const nativeExamples = {
            swift: 'XCUITest',
            kotlin: 'Espresso',
            rust: 'cargo test --test integration',
            dotnet: 'dotnet test --filter Category=UI',
            java: 'mvn verify -P integration',
          };
          const ex = nativeExamples[a.techStack];
          return ex
            ? `UI/integration test command (${ex} - reference only, leave blank to skip):`
            : 'Integration test command (reference only, leave blank to skip):';
        },
        when: (a) => {
          const tier = options.tier || a.tier;
          return tier === 'm' || tier === 'l';
        },
        default: '',
      },
      // Feature flags - tier M/L only
      {
        type: 'confirm',
        name: 'hasApi',
        message:
          'Does your project expose an API (REST, GraphQL, RPC)? (controls whether api-design checks are included)',
        when: (a) => {
          const tier = options.tier || a.tier;
          return tier === 'm' || tier === 'l';
        },
        default: false,
      },
      {
        type: 'confirm',
        name: 'hasDatabase',
        message:
          'Does your project use a database? (controls whether skill-db checks are included)',
        when: (a) => {
          const tier = options.tier || a.tier;
          return tier === 'm' || tier === 'l';
        },
        default: true,
      },
      {
        type: 'confirm',
        name: 'hasFrontend',
        message: (a) => {
          const isNative = NATIVE_STACKS.includes(a.techStack);
          return isNative
            ? 'Does your project have a UI? (controls whether visual-audit and ux-audit are included)'
            : 'Does your project have a UI? (controls whether visual-audit, ux-audit, responsive-audit are included)';
        },
        when: (a) => {
          const tier = options.tier || a.tier;
          return tier === 'm' || tier === 'l';
        },
        default: true,
      },
      {
        type: 'confirm',
        name: 'hasDesignSystem',
        message: (a) => {
          const isNative = [...NATIVE_STACKS, 'other'].includes(a.techStack);
          return isNative
            ? 'Do you follow a design guideline? (Apple HIG, Material Design, other) (controls whether ui-audit is included)'
            : 'Do you use a component library or design system? (shadcn, MUI, Tailwind…) (controls whether ui-audit is included)';
        },
        when: (a) => {
          const tier = options.tier || a.tier;
          return (tier === 'm' || tier === 'l') && a.hasFrontend === true;
        },
        default: true,
      },
      {
        type: 'input',
        name: 'designSystemName',
        message: (a) => {
          const nativeExamples = {
            swift: 'Apple HIG, SwiftUI',
            kotlin: 'Material Design 3, Material You',
            dotnet: 'Fluent Design, WinUI',
            java: 'Material Design, JavaFX',
          };
          const ex = nativeExamples[a.techStack];
          return ex
            ? `Design guideline name (e.g. ${ex}):`
            : 'Design system name (e.g. shadcn/ui, MUI, Ant Design):';
        },
        when: (a) => {
          const tier = options.tier || a.tier;
          return (
            (tier === 'm' || tier === 'l') && a.hasFrontend === true && a.hasDesignSystem === true
          );
        },
        default: (a) => {
          const nativeDefaults = {
            swift: 'Apple HIG',
            kotlin: 'Material Design 3',
            dotnet: 'Fluent Design',
            java: 'Material Design',
          };
          return nativeDefaults[a.techStack] || 'component library';
        },
      },
      {
        type: 'select',
        name: 'auditModel',
        message:
          'Preferred model for deep analysis skills (ux-audit, visual-audit - full codebase scans)?',
        when: (a) => {
          const tier = options.tier || a.tier;
          return (tier === 'm' || tier === 'l') && a.hasFrontend === true;
        },
        choices: AUDIT_MODELS,
        default: 'claude-sonnet-4-6',
      },
      {
        type: 'confirm',
        name: 'includePreCommit',
        message: 'Include pre-commit config (secret scanning + AI commit audit)?',
        default: true,
      },
      {
        type: 'confirm',
        name: 'includeGithub',
        message: `Include .github/ (PR template + CODEOWNERS)?${!hasGithubRemote ? chalk.dim(' (no GitHub remote detected)') : ''}`,
        default: hasGithubRemote,
      },
    ]);
  } // end else (interactive path)

  const finalTier = options.tier || answers.tier;
  enforceTeamSettingsTier(cwd, finalTier);

  const config = {
    ...answers,
    tier: finalTier,
    mode: 'in-place',
    // Pass detected values as fallbacks for the Stop hook interpolation
    buildCommand: answers.buildCommand || detected.buildCommand,
    installCommand: answers.installCommand || detected.installCommand,
    hasE2E: answers.e2eCommand ? answers.e2eCommand.trim() !== '' : false,
    hasApi: answers.hasApi,
    hasDatabase: answers.hasDatabase,
    hasFrontend: answers.hasFrontend,
    hasDesignSystem: answers.hasDesignSystem,
    designSystemName: answers.designSystemName || 'component library',
    auditModel: answers.auditModel || 'claude-sonnet-4-6',
    hasPrd: answers.hasPrd ?? false,
  };

  // ── Conflict preview ─────────────────────────────────────────────────

  const conflicts = await detectConflicts(cwd, config);
  if (conflicts.length > 0) {
    console.log();
    console.log(chalk.yellow('These files already exist and will NOT be overwritten:'));
    conflicts.forEach((f) => console.log(`  ${chalk.dim('=')} ${f}`));
  }

  if (options.dryRun) {
    console.log();
    console.log(chalk.yellow('Dry run - no files will be written.'));
    console.log();
    printPlan(config);
    return;
  }

  // ── Scaffold (safe mode - no overwrites) ─────────────────────────────

  const fsCheck = (await import('fs-extra')).default;
  const claudeMdExisted = await fsCheck.pathExists(path.join(cwd, 'CLAUDE.md'));

  const spinner = ora('Adding governance scaffold to existing project...').start();

  try {
    await scaffoldTierSafe(config.tier, cwd, config, TEMPLATES_DIR);

    // Generate processed CLAUDE.md (Active Skills, @-imports, section stripping)
    // only when CLAUDE.md was freshly created - never overwrite a pre-existing one
    if (!claudeMdExisted && (config.tier === 's' || config.tier === 'm' || config.tier === 'l')) {
      await generateClaudeMd(config, cwd);
    }

    spinner.text = 'Generating CONTEXT_IMPORT.md...';
    await generateContextImport(
      config,
      cwd,
      [{ name: path.basename(cwd), path: cwd, source: '.' }],
      [],
    );
    spinner.succeed('Governance scaffold added.');
  } catch (err) {
    spinner.fail('Scaffolding failed.');
    console.error(chalk.red(err.message));
    process.exit(1);
  }

  // Append .claude/session to existing .gitignore if needed
  await appendIfMissing(cwd, [
    '.claude/session/',
    '.claude/context/',
    '.claude/CLAUDE.local.md',
    '.claude/settings.local.json',
    'CONTEXT_IMPORT.md',
  ]);

  // ── Summary ──────────────────────────────────────────────────────────

  console.log();
  console.log(chalk.green.bold('✓ In-place scaffold complete'));
  console.log();
  printPlan(config);

  // ── Optional inline validation ────────────────────────────────────────

  let ranDoctor = false;
  let ranPreCommit = false;

  if (!options.answers) {
    console.log();
    const { runDoctorNow } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'runDoctorNow',
        message: 'Validate setup with doctor now?',
        default: true,
      },
    ]);

    if (runDoctorNow) {
      console.log();
      console.log(chalk.dim('  Checking file structure, hooks, and pipeline setup...'));
      console.log();
      try {
        execSync(`node "${process.argv[1]}" doctor`, { cwd, stdio: 'inherit' });
        ranDoctor = true;
      } catch {
        console.log(chalk.yellow('  Doctor reported issues - review above before proceeding.'));
      }
    }

    if (config.includePreCommit) {
      console.log();
      const { runPreCommitNow } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'runPreCommitNow',
          message: 'Install pre-commit hooks now? (blocks commits that contain API keys or tokens)',
          default: false,
        },
      ]);

      if (runPreCommitNow) {
        const preCommitInstallCmd =
          process.platform === 'darwin'
            ? 'brew install pre-commit && pre-commit install'
            : 'pip install pre-commit && pre-commit install';
        const spinner2 = ora('Installing pre-commit hooks...').start();
        try {
          execSync(preCommitInstallCmd, { cwd, stdio: 'pipe' });
          spinner2.succeed('Pre-commit hooks installed.');
          ranPreCommit = true;
        } catch {
          spinner2.fail(`Install failed - run manually: ${preCommitInstallCmd}`);
        }
      }
    }
  }

  // ── Next steps ────────────────────────────────────────────────────────

  console.log();
  console.log(chalk.bold('Next steps:'));
  printNextSteps(config, { ranDoctor, ranPreCommit });
  console.log();
  console.log(chalk.dim('Docs: https://github.com/marcoguillermaz/tierward'));
  console.log();
  printStarCta({ doctorPassed: ranDoctor || undefined });
}

async function detectConflicts(dir, _config) {
  const fs = (await import('fs-extra')).default;
  const critical = ['CLAUDE.md', 'MEMORY.md', '.gitignore', 'README.md'];
  const conflicts = [];
  for (const f of critical) {
    if (await fs.pathExists(path.join(dir, f))) conflicts.push(f);
  }
  return conflicts;
}

async function appendIfMissing(dir, entries) {
  const fs = (await import('fs-extra')).default;
  const gitignorePath = path.join(dir, '.gitignore');
  let content = '';

  if (await fs.pathExists(gitignorePath)) {
    content = await fs.readFile(gitignorePath, 'utf8');
  }

  const toAdd = entries.filter((e) => !content.includes(e));
  if (toAdd.length > 0) {
    const section = '\n# tierward\n' + toAdd.join('\n') + '\n';
    await fs.appendFile(gitignorePath, section);
  }
}
