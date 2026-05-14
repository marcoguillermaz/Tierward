/**
 * PM-flow interview for the Context Builder.
 *
 * Implements the 18-question PM-friendly flow locked in
 * project_context_builder_decisions.md (decision D + flow tables).
 * Q1 (persona check) lives in persona.js — this module runs Q2-Q18.
 *
 * Public surface:
 *  - runPmInterview(options): full interactive flow, returns { frontmatter, body }
 *  - buildFrontmatterFromAnswers(answers, ctx): pure builder, testable
 *  - composeBodyFromAnswers(answers): pure body builder, testable
 *  - STACK_DEFAULTS: per-stack default commands
 *  - HARD_STOP_TIERS: tiers blocked in v1 (M, L)
 *
 * Schema v1 covers tier 0/S only. M/L selection is blocked with a
 * redirect message to the legacy wizard.
 */
import inquirer from 'inquirer';
import { DEFAULT_BODY } from '../writer.js';

// HARD_STOP_TIERS was used in v1.0-v1.2 to block tier M/L. Kept as an
// empty array in v1.27.0+ so legacy callers (tests, plugins) still find
// the export but the hard-stop no longer triggers.
export const HARD_STOP_TIERS = Object.freeze([]);

/**
 * Default command suggestions per stack. Used as inquirer defaults so
 * the PM presses Enter to accept, or types to override. type_check is
 * only populated for stacks that have a native type-check step (node-ts).
 */
export const STACK_DEFAULTS = {
  'node-ts': {
    install: 'npm install',
    test: 'npx vitest run',
    type_check: 'npx tsc --noEmit',
    dev: 'npm run dev',
  },
  'node-js': {
    install: 'npm install',
    test: 'npm test',
    type_check: null,
    dev: 'npm run dev',
  },
  python: {
    install: 'pip install -r requirements.txt',
    test: 'pytest',
    type_check: null,
    dev: 'uvicorn main:app --reload',
  },
  go: {
    install: 'go mod download',
    test: 'go test ./...',
    type_check: null,
    dev: 'go run .',
  },
  swift: {
    install: 'swift package resolve',
    test: 'swift test',
    type_check: null,
    dev: 'swift run',
  },
  kotlin: {
    install: './gradlew dependencies',
    test: './gradlew test',
    type_check: null,
    dev: './gradlew run',
  },
  rust: {
    install: 'cargo build',
    test: 'cargo test',
    type_check: null,
    dev: 'cargo run',
  },
  dotnet: {
    install: 'dotnet restore',
    test: 'dotnet test',
    type_check: null,
    dev: 'dotnet run',
  },
  ruby: {
    install: 'bundle install',
    test: 'bundle exec rspec',
    type_check: null,
    dev: 'bundle exec rails server',
  },
  java: {
    install: 'mvn install',
    test: 'mvn test',
    type_check: null,
    dev: 'mvn exec:java',
  },
  other: {
    install: '',
    test: '',
    type_check: null,
    dev: '',
  },
};

/**
 * Suggest a tier from familiarity + diagnostic answers.
 * Returns one of '0' | 's' | 'm' | 'l'.
 */
export function suggestTier(answers) {
  if (answers.familiarity === '0') return '0';
  if (answers.workScope === 'bugfix') return 's';
  if (answers.workScope === 'complex') return 'l';
  if (answers.teamSize === 'large') return 'l';
  return 'm';
}

/**
 * Build the schema-conformant frontmatter from raw inquirer answers.
 *
 * @param {object} answers - Raw answers from inquirer
 * @param {object} ctx - Context: { mode, generatedByVersion }
 * @returns {object} Frontmatter object
 */
export function buildFrontmatterFromAnswers(answers, ctx) {
  const tierSelected = answers.tier ?? (answers.familiarity === '0' ? '0' : 's');
  const isTier0 = tierSelected === '0';

  const stackKey = answers.techStack ?? 'other';
  const stackDefaults = STACK_DEFAULTS[stackKey] ?? STACK_DEFAULTS.other;

  const commands = {
    install: answers.installCommand ?? stackDefaults.install,
    test: answers.testCommand ?? stackDefaults.test,
  };
  if (answers.typeCheckCommand !== undefined) {
    commands.type_check = answers.typeCheckCommand === '' ? null : answers.typeCheckCommand;
  } else if (stackDefaults.type_check) {
    commands.type_check = stackDefaults.type_check;
  }
  if (answers.devCommand !== undefined) {
    commands.dev = answers.devCommand === '' ? null : answers.devCommand;
  } else if (stackDefaults.dev) {
    commands.dev = stackDefaults.dev;
  }
  // v1.27.0+ tier M/L extras
  if (answers.e2eCommand !== undefined) {
    commands.e2e = answers.e2eCommand.trim() === '' ? null : answers.e2eCommand.trim();
  }
  if (answers.buildCommand !== undefined) {
    commands.build = answers.buildCommand.trim() === '' ? null : answers.buildCommand.trim();
  }

  const frontmatter = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    generated_by: 'context-builder',
    generated_by_version: ctx.generatedByVersion ?? '1.0.0',
    project: {
      name: answers.projectName,
      description: answers.description,
      mode: ctx.mode,
    },
    stack: { primary: stackKey },
    commands,
    tier: {
      selected: tierSelected,
      rationale: answers.tierRationale ?? '',
    },
    scaffold_options: {
      include_pre_commit: isTier0 ? false : (answers.includePreCommit ?? true),
      include_github: isTier0 ? false : (answers.includeGithub ?? false),
    },
  };

  // v1.27.0+ tier M/L feature flags + audit_model.
  // Only emit features block when tier is M or L (schema C8).
  if (tierSelected === 'm' || tierSelected === 'l') {
    const features = {};
    if (answers.hasApi !== undefined) features.has_api = answers.hasApi;
    if (answers.hasDatabase !== undefined) features.has_database = answers.hasDatabase;
    if (answers.hasFrontend !== undefined) features.has_frontend = answers.hasFrontend;
    if (answers.hasDesignSystem !== undefined) features.has_design_system = answers.hasDesignSystem;
    if (answers.designSystemName) features.design_system_name = answers.designSystemName;
    if (answers.hasPrd !== undefined) features.has_prd = answers.hasPrd;
    if (Object.keys(features).length > 0) frontmatter.features = features;
    if (answers.auditModel) frontmatter.audit_model = answers.auditModel;
  }

  return frontmatter;
}

/**
 * Compose body markdown from PM prose answers.
 * Returns undefined when no prose was provided (writer uses DEFAULT_BODY).
 */
export function composeBodyFromAnswers(answers) {
  const w = (answers.bodyWhatBuilding ?? '').trim();
  const c = (answers.bodyConstraints ?? '').trim();
  const q = (answers.bodyOpenQuestions ?? '').trim();

  if (!w && !c && !q) return undefined;

  const ph = (val, placeholder) => (val ? val : placeholder);
  return `# Project Context

## What we are building
${ph(w, "[Describe what you're building — 1-3 paragraphs]")}

## Operational constraints
${ph(c, '[Deadlines, governance, regulatory requirements, team rules]')}

## Open questions
${ph(q, '[Questions to track. Auto-populated from pending_decisions during interview.]')}
`;
}

/**
 * Build the inquirer question list. Pure factory — no side effects.
 * Exposed for testability and for callers that want to inject answers.
 */
export function assembleQuestions({ projectNameDefault } = {}) {
  return [
    {
      type: 'list',
      name: 'familiarity',
      message: 'How familiar is your team with Claude Code?',
      choices: [
        { name: "Just starting out — show me what's possible  (Discovery tier)", value: '0' },
        { name: 'We use it and want guardrails               (Tier S)', value: 'experienced' },
      ],
    },
    {
      type: 'input',
      name: 'projectName',
      message: 'Project name?',
      default: projectNameDefault,
      validate: (v) => v.trim().length > 0 || 'Required',
    },
    {
      type: 'input',
      name: 'description',
      message: 'In one sentence, what are you building?',
      validate: (v) => v.trim().length > 0 || 'Required',
    },
    {
      type: 'list',
      name: 'techStack',
      message: 'Primary tech stack?',
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
      type: 'list',
      name: 'teamSize',
      message: 'How many engineers will use Claude Code on this project?',
      when: (a) => a.familiarity !== '0',
      choices: [
        { name: 'Just me', value: 'solo' },
        { name: 'Small team (2–5)', value: 'small' },
        { name: 'Larger team (6+)', value: 'large' },
      ],
    },
    {
      type: 'list',
      name: 'workScope',
      message: 'What kind of work will you primarily do?',
      when: (a) => a.familiarity !== '0',
      choices: [
        { name: 'Bugfixes and small patches (≤3 files)', value: 'bugfix' },
        { name: 'Feature blocks (1–2 week chunks)', value: 'feature' },
        { name: 'Complex features or long-running projects', value: 'complex' },
      ],
    },
    {
      type: 'list',
      name: 'tier',
      message: (a) => `Suggested: ${suggestTier(a).toUpperCase()}. Pipeline tier:`,
      when: (a) => a.familiarity !== '0',
      default: (a) => suggestTier(a),
      choices: [
        { name: 'S — Fast Lane (bugfixes, ≤3 files)', value: 's' },
        { name: 'M — Standard (feature blocks, 1-2 weeks)', value: 'm' },
        { name: 'L — Full (complex domain, team)', value: 'l' },
      ],
    },
    {
      type: 'input',
      name: 'tierRationale',
      message: 'In one sentence, why is this tier the right fit?',
      default: (a) => {
        if (a.familiarity === '0') return 'Brand new to Claude Code, exploring';
        const team =
          a.teamSize === 'solo'
            ? 'Solo developer'
            : a.teamSize === 'small'
              ? 'Small team'
              : 'Larger team';
        const scope =
          a.workScope === 'bugfix'
            ? 'bugfixes ≤3 files'
            : a.workScope === 'complex'
              ? 'complex projects'
              : 'feature blocks';
        return `${team}, ${scope}`;
      },
      validate: (v) => v.trim().length > 0 || 'Required',
    },
    {
      type: 'input',
      name: 'installCommand',
      message: 'Install command?',
      when: (a) => a.familiarity !== '0',
      default: (a) => STACK_DEFAULTS[a.techStack]?.install ?? '',
    },
    {
      type: 'input',
      name: 'testCommand',
      message: 'Test command?',
      when: (a) => a.familiarity !== '0',
      default: (a) => STACK_DEFAULTS[a.techStack]?.test ?? '',
    },
    {
      type: 'input',
      name: 'typeCheckCommand',
      message: 'Type-check command? (leave blank if none)',
      when: (a) => a.familiarity !== '0' && a.techStack === 'node-ts',
      default: STACK_DEFAULTS['node-ts'].type_check,
    },
    {
      type: 'input',
      name: 'devCommand',
      message: 'Dev command?',
      when: (a) => a.familiarity !== '0',
      default: (a) => STACK_DEFAULTS[a.techStack]?.dev ?? '',
    },
    // ── Tier M / L extras (v1.27.0+) ──────────────────────────────
    {
      type: 'input',
      name: 'e2eCommand',
      message: 'E2E / integration test command? (leave blank to skip)',
      when: (a) => a.tier === 'm' || a.tier === 'l',
      default: '',
    },
    {
      type: 'confirm',
      name: 'hasApi',
      message: 'Does this project expose an API (REST / GraphQL / RPC)?',
      when: (a) => a.tier === 'm' || a.tier === 'l',
      default: false,
    },
    {
      type: 'confirm',
      name: 'hasDatabase',
      message: 'Does this project use a database?',
      when: (a) => a.tier === 'm' || a.tier === 'l',
      default: true,
    },
    {
      type: 'confirm',
      name: 'hasFrontend',
      message: 'Does this project have a UI?',
      when: (a) => a.tier === 'm' || a.tier === 'l',
      default: true,
    },
    {
      type: 'confirm',
      name: 'hasDesignSystem',
      message: 'Do you use a component library or design system (shadcn, MUI, Tailwind, …)?',
      when: (a) => (a.tier === 'm' || a.tier === 'l') && a.hasFrontend === true,
      default: true,
    },
    {
      type: 'input',
      name: 'designSystemName',
      message: 'Design system name (e.g. shadcn/ui, MUI, Tailwind):',
      when: (a) =>
        (a.tier === 'm' || a.tier === 'l') && a.hasFrontend === true && a.hasDesignSystem === true,
      default: 'component library',
      validate: (v) => v.trim().length > 0 || 'Required when hasDesignSystem=true',
    },
    {
      type: 'confirm',
      name: 'hasPrd',
      message: 'Track a PRD per feature block?',
      when: (a) => a.tier === 'm' || a.tier === 'l',
      default: false,
    },
    {
      type: 'input',
      name: 'auditModel',
      message: 'Preferred Claude model for deep-analysis skills (visual-audit, ux-audit)?',
      when: (a) => (a.tier === 'm' || a.tier === 'l') && a.hasFrontend === true,
      default: 'claude-sonnet-4-6',
    },
    // ──────────────────────────────────────────────────────────────
    {
      type: 'confirm',
      name: 'includePreCommit',
      message: 'Include pre-commit hooks (secret scanning)?',
      when: (a) => a.familiarity !== '0',
      default: true,
    },
    {
      type: 'confirm',
      name: 'includeGithub',
      message: 'Include .github/ (PR template + CODEOWNERS)?',
      when: (a) => a.familiarity !== '0',
      default: false,
    },
    {
      type: 'input',
      name: 'bodyWhatBuilding',
      message: "Anything else to add about what you're building? (skip ok)",
      default: '',
    },
    {
      type: 'input',
      name: 'bodyConstraints',
      message: 'Any operational constraints to flag? (deadlines, governance) (skip ok)',
      default: '',
    },
    {
      type: 'input',
      name: 'bodyOpenQuestions',
      message: 'Any open questions to track? (skip ok)',
      default: '',
    },
  ];
}

/**
 * Run the PM-flow interview interactively and return { frontmatter, body }.
 *
 * @param {object} options - { mode, projectNameDefault, generatedByVersion, prefilledAnswers }
 * @returns {Promise<{ frontmatter: object, body: string | undefined }>}
 */
export async function runPmInterview(options = {}) {
  const mode = options.mode ?? 'greenfield';
  const questions = assembleQuestions({ projectNameDefault: options.projectNameDefault });

  const answers = options.prefilledAnswers ?? (await inquirer.prompt(questions));

  if (HARD_STOP_TIERS.includes(answers.tier)) {
    const err = new Error(
      `Tier ${answers.tier.toUpperCase()} not supported in v1. Use \`npx mg-claude-dev-kit init\` (legacy) instead.`,
    );
    err.code = 'TIER_NOT_SUPPORTED_V1';
    throw err;
  }

  const frontmatter = buildFrontmatterFromAnswers(answers, {
    mode,
    generatedByVersion: options.generatedByVersion ?? '1.0.0',
  });
  const body = composeBodyFromAnswers(answers) ?? DEFAULT_BODY;

  return { frontmatter, body };
}
