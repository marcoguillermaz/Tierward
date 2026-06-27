import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateClaudeMd } from '../generators/claude-md.js';
import { generateReadme } from '../generators/readme.js';
import { generateGreenfieldContextImport } from '../generators/context-import.js';
import { scaffoldTier } from '../scaffold/index.js';
import { printPlan, printNextSteps, printStarCta } from '../utils/print-plan.js';
import { AUDIT_MODELS } from '../utils/constants.js';
import { NATIVE_STACKS, WEB_STACKS } from '../scaffold/skill-registry.js';
import { enforceTeamSettingsTier } from '../utils/team-settings-cli.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');

function suggestTierFromDiagnostics(answers) {
  if (answers.workScope === 'bugfix') return 's';
  if (answers.workScope === 'complex') return 'l';
  if (answers.teamSize === 'large') return 'l';
  return 'm';
}

export async function initGreenfield(options) {
  let isDiscovery;
  let answers;

  if (options.answers) {
    const parsed = JSON.parse(options.answers);
    isDiscovery = parsed.tier === '0';
    answers = parsed;
  } else {
    // First question: gauge familiarity to route beginners to Tier 0
    const { familiarity } = await inquirer.prompt([
      {
        type: 'select',
        name: 'familiarity',
        message: 'How familiar is your team with Claude Code?',
        choices: [
          {
            name: "Just starting out - show me what's possible  (Discovery tier)",
            value: '0',
          },
          {
            name: 'We use it and want guardrails               (Tier S / M / L)',
            value: 'experienced',
          },
        ],
      },
    ]);

    isDiscovery = familiarity === '0';

    answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: 'Project name:',
        default: path.basename(process.cwd()),
        validate: (v) => v.trim().length > 0 || 'Required',
      },
      {
        type: 'input',
        name: 'description',
        message: 'Short description (one line):',
        validate: (v) => v.trim().length > 0 || 'Required',
      },
      // Diagnostic tier selection for experienced users
      {
        type: 'select',
        name: 'teamSize',
        message: 'How many engineers will regularly use Claude Code on this project?',
        when: () => !isDiscovery && !options.tier,
        choices: [
          { name: 'Just me', value: 'solo' },
          { name: 'Small team (2–5)', value: 'small' },
          { name: 'Larger team (6+)', value: 'large' },
        ],
      },
      {
        type: 'select',
        name: 'workScope',
        message: 'What kind of work will you primarily do?',
        when: () => !isDiscovery && !options.tier,
        choices: [
          { name: 'Bugfixes and small patches (≤3 files)', value: 'bugfix' },
          { name: 'Feature blocks (1–2 week chunks)', value: 'feature' },
          { name: 'Complex features or long-running projects', value: 'complex' },
        ],
      },
      {
        type: 'select',
        name: 'tier',
        message: (a) => {
          const suggested = suggestTierFromDiagnostics(a);
          const tierDesc = {
            0: '0 - Discovery    Context only, no pipeline.',
            s: 'S - Fast Lane     4 steps, 1 scope-confirm. Bugfixes, ≤3 files.',
            m: 'M - Standard     8 phases, 2 STOP gates. Feature blocks, 1–2 weeks.',
            l: 'L - Full         11 phases, 4 STOP gates + audit. Complex domain, team.',
          };
          return `Suggested: ${tierDesc[suggested]}\n  Pipeline tier:`;
        },
        when: () => !isDiscovery && !options.tier,
        default: (a) => suggestTierFromDiagnostics(a),
        choices: [
          { name: '0 - Discovery (context only, no pipeline)', value: '0' },
          { name: 'S - Fast Lane (bugfixes, ≤3 files, 1 gate)', value: 's' },
          { name: 'M - Standard (feature blocks, 1–2 weeks, 2 gates)', value: 'm' },
          { name: 'L - Full (complex domain, full governance, 4 gates)', value: 'l' },
        ],
      },
      {
        type: 'select',
        name: 'techStack',
        message: 'Primary tech stack:',
        choices: [
          { name: 'Node.js / TypeScript', value: 'node-ts' },
          { name: 'Node.js / JavaScript', value: 'node-js' },
          { name: 'Python', value: 'python' },
          { name: 'Go', value: 'go' },
          { name: 'Swift / macOS / iOS', value: 'swift' },
          { name: 'Kotlin / Android', value: 'kotlin' },
          { name: 'Rust', value: 'rust' },
          { name: '.NET / C#', value: 'dotnet' },
          { name: 'Ruby', value: 'ruby' },
          { name: 'Java', value: 'java' },
          { name: 'Other / mixed', value: 'other' },
        ],
      },
      {
        type: 'input',
        name: 'testCommand',
        message: 'Test command: (used as reference in pipeline docs - not executed by the CLI)',
        default: (a) => {
          const defaults = {
            'node-ts': 'npx vitest run',
            'node-js': 'npm test',
            python: 'pytest',
            go: 'go test ./...',
            swift: `xcodebuild test -scheme ${a.projectName}`,
            kotlin: './gradlew test',
            rust: 'cargo test',
            dotnet: 'dotnet test',
            ruby: 'bundle exec rspec',
            java: 'mvn test',
            other: '',
          };
          return defaults[a.techStack] ?? 'npm test';
        },
      },
      {
        type: 'input',
        name: 'typeCheckCommand',
        message: 'Type check command (leave blank if none):',
        when: (a) => !isDiscovery && a.techStack === 'node-ts',
        default: 'npx tsc --noEmit',
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
        default: (a) =>
          ({
            'node-ts': 'npm run dev',
            'node-js': 'npm run dev',
            python: 'uvicorn main:app --reload',
            go: 'go run .',
            ruby: 'bundle exec rails server',
            swift: 'swift run',
            kotlin: './gradlew run',
            rust: 'cargo run',
            dotnet: 'dotnet run',
            java: 'mvn exec:java',
            other: '',
          })[a.techStack] || 'npm run dev',
      },
      {
        type: 'input',
        name: 'e2eCommand',
        message: (a) => {
          const webStacks = WEB_STACKS;
          if (webStacks.includes(a.techStack)) {
            return 'E2E test command (Playwright/Cypress - leave blank to skip):';
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
            ? `UI/integration test command (${ex} - leave blank to skip):`
            : 'Integration test command (optional, leave blank to skip):';
        },
        when: (a) => {
          if (isDiscovery) return false;
          const tier = options.tier || a.tier;
          return tier === 'm' || tier === 'l';
        },
        default: '',
      },
      // Feature flags - tier M/L only
      {
        type: 'select',
        name: 'hasApi',
        message:
          'Does your project expose an API (REST, GraphQL, RPC)? (controls whether api-design checks are included)',
        when: (a) => {
          if (isDiscovery) return false;
          const tier = options.tier || a.tier;
          return tier === 'm' || tier === 'l';
        },
        choices: [
          { name: 'No', value: false },
          { name: 'Yes', value: true },
        ],
        default: false,
      },
      {
        type: 'select',
        name: 'hasDatabase',
        message:
          'Does your project use a database? (controls whether skill-db checks are included)',
        when: (a) => {
          if (isDiscovery) return false;
          const tier = options.tier || a.tier;
          return tier === 'm' || tier === 'l';
        },
        choices: [
          { name: 'Yes', value: true },
          { name: 'No', value: false },
        ],
      },
      {
        type: 'select',
        name: 'hasFrontend',
        message:
          'Does your project have a UI? (controls whether visual-audit, ux-audit, responsive-audit are included)',
        when: (a) => {
          if (isDiscovery) return false;
          const tier = options.tier || a.tier;
          return tier === 'm' || tier === 'l';
        },
        choices: [
          { name: 'Yes', value: true },
          { name: 'No', value: false },
        ],
      },
      {
        type: 'select',
        name: 'hasDesignSystem',
        message: (a) => {
          const isNative = [...NATIVE_STACKS, 'other'].includes(a.techStack);
          return isNative
            ? 'Do you follow a design guideline? (Apple HIG, Material Design, other) (controls whether ui-audit is included)'
            : 'Do you use a component library or design system? (shadcn, MUI, Tailwind…) (controls whether ui-audit is included)';
        },
        when: (a) => {
          if (isDiscovery) return false;
          const tier = options.tier || a.tier;
          return (tier === 'm' || tier === 'l') && a.hasFrontend === true;
        },
        choices: [
          { name: 'Yes', value: true },
          { name: 'No', value: false },
        ],
      },
      {
        type: 'input',
        name: 'designSystemName',
        message: 'Design system name (e.g. shadcn/ui, MUI, Ant Design):',
        when: (a) => {
          if (isDiscovery) return false;
          const tier = options.tier || a.tier;
          return (
            (tier === 'm' || tier === 'l') && a.hasFrontend === true && a.hasDesignSystem === true
          );
        },
        default: 'component library',
      },
      {
        type: 'select',
        name: 'auditModel',
        message:
          'Preferred model for deep analysis skills (ux-audit, visual-audit - full codebase scans)?',
        when: (a) => {
          if (isDiscovery) return false;
          const tier = options.tier || a.tier;
          return (tier === 'm' || tier === 'l') && a.hasFrontend === true;
        },
        choices: AUDIT_MODELS,
        default: 'claude-sonnet-4-6',
      },
      {
        type: 'confirm',
        name: 'hasPrd',
        message:
          'Track a PRD per feature block? (In Tier M/L work is split in ~1–2 week blocks - if yes, a PRD template is added to each)',
        when: (a) => {
          if (isDiscovery) return false;
          const tier = options.tier || a.tier;
          return tier === 'm' || tier === 'l';
        },
        default: false,
      },
      {
        type: 'confirm',
        name: 'includePreCommit',
        message: 'Include pre-commit config (secret scanning + AI commit audit)?',
        default: true,
        when: !isDiscovery,
      },
      {
        type: 'confirm',
        name: 'includeGithub',
        message: 'Include .github/ (PR template + CODEOWNERS)?',
        default: true,
        when: !isDiscovery,
      },
    ]);
  } // end else (interactive path)

  const tier = isDiscovery ? '0' : options.tier || answers.tier || 's';

  enforceTeamSettingsTier(process.cwd(), tier);

  const config = {
    ...answers,
    tier,
    mode: 'greenfield',
    isDiscovery,
    includePreCommit: isDiscovery ? false : answers.includePreCommit,
    includeGithub: isDiscovery ? false : answers.includeGithub,
    hasE2E: answers.e2eCommand ? answers.e2eCommand.trim() !== '' : false,
    hasApi: answers.hasApi,
    hasDatabase: answers.hasDatabase,
    hasFrontend: answers.hasFrontend,
    hasDesignSystem: answers.hasDesignSystem,
    designSystemName: answers.designSystemName || 'component library',
    auditModel: answers.auditModel || 'claude-sonnet-4-6',
    hasPrd: answers.hasPrd ?? false,
  };

  if (options.dryRun) {
    console.log();
    console.log(chalk.yellow('Dry run - no files will be written.'));
    console.log();
    printPlan(config);
    return;
  }

  const spinner = ora('Scaffolding project...').start();
  try {
    await scaffoldTier(tier, process.cwd(), config, TEMPLATES_DIR);
    await generateClaudeMd(config, process.cwd());
    if (!isDiscovery) {
      await generateReadme(config, process.cwd());
      // scaffoldTier copies the raw common/CONTEXT_IMPORT.md (an import-from-repo
      // workflow whose [SOURCE_REPOS]/[IMPORT_MODE] placeholders interpolate()
      // leaves raw). Overwrite it with the idea-based greenfield variant.
      // Tier 0 (isDiscovery) never gets CONTEXT_IMPORT — scaffoldTier0 skips it.
      await generateGreenfieldContextImport(config, process.cwd());
    }
    spinner.succeed('Done.');
  } catch (err) {
    spinner.fail('Scaffolding failed.');
    console.error(chalk.red(err.message));
    process.exit(1);
  }

  console.log();

  if (isDiscovery) {
    console.log(chalk.green.bold('✓ Discovery scaffold complete'));
    console.log();
    console.log(chalk.bold('What was created:'));
    console.log(
      `  ${chalk.cyan('CLAUDE.md')}             - fill this in: project overview, stack, key commands`,
    );
    console.log(
      `  ${chalk.cyan('.claude/settings.json')} - Stop hook: tests must pass before Claude declares done`,
    );
    console.log(
      `  ${chalk.cyan('GETTING_STARTED.md')}    - your team's guide to the first session`,
    );
    console.log();
    console.log(chalk.bold('Next steps:'));
    console.log(
      `  1. Edit ${chalk.cyan('CLAUDE.md')} - add your project description and fill in the commands`,
    );
    console.log(`  2. Run ${chalk.cyan('claude')} from this directory to start your first session`);
    console.log(`  3. Read ${chalk.cyan('GETTING_STARTED.md')} - or share it with your team`);
    console.log();
    console.log(
      chalk.dim(
        'When you\'re ready for more structure: npx tierward init --tier=s (choose "Existing project")',
      ),
    );
  } else {
    console.log(chalk.green.bold('✓ Greenfield scaffold complete'));
    console.log();
    printPlan(config);
    console.log();
    console.log(chalk.bold('Next steps:'));
    printNextSteps(config);
  }

  console.log();
  console.log(chalk.dim('Docs: https://github.com/marcoguillermaz/tierward'));
  console.log();
  printStarCta();
}
