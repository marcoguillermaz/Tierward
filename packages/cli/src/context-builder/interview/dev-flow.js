/**
 * Developer-oriented Context Builder interview.
 *
 * Reuses the question set from the legacy technical wizard
 * (init-greenfield / init-in-place / init-from-context) so a dev gets
 * the same prompts they expect from `init`, then maps the answers onto
 * schema v1 CONTEXT.md fields. Differences vs the PM flow:
 *
 *   - tier.rationale is auto-derived from teamSize + workScope (no prompt)
 *   - body markdown defaults to DEFAULT_BODY placeholder for greenfield
 *     (no Q16-Q18 prose). For existing-mode, Phase 2 LLM populates body
 *     sections when reachable; otherwise body falls back to placeholder.
 *   - Phase 2 LLM errors are swallowed silently (dev should not be
 *     blocked by missing API keys / offline runs).
 *
 * Locked behavior — see memory: project_context_builder_scope_v1.md
 * (v1.1 P0 dev flow ricablato sul wizard tecnico legacy).
 */
import inquirer from 'inquirer';
import { runAlgoInference } from '../inference/algo.js';
import { extractWithLlm } from '../inference/llm.js';
import { mergeLlmIntoDraft, composeBodyMarkdown } from '../inference/review.js';
import { DEFAULT_BODY } from '../writer.js';
import { STACK_DEFAULTS, TECH_STACK_CHOICES, HARD_STOP_TIERS } from './shared/stack-defaults.js';
import { deriveDevRationale } from './shared/derive-rationale.js';

export { HARD_STOP_TIERS };

/**
 * Build the inquirer question list for the dev interview.
 * `algoDefaults` (optional) is the Phase-1 draft used to pre-fill answers
 * for existing-mode runs.
 */
export function assembleDevQuestions({ mode, projectNameDefault, algoDefaults } = {}) {
  const stackDefault = algoDefaults?.stack?.primary ?? 'node-ts';
  const cmdDefaults = algoDefaults?.commands ?? {};

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
      when: () => mode === 'greenfield',
      validate: (v) => v.trim().length > 0 || 'Required',
    },
    {
      type: 'list',
      name: 'techStack',
      message: 'Primary tech stack?',
      default: stackDefault,
      choices: TECH_STACK_CHOICES,
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
      message: 'Pipeline tier:',
      when: (a) => a.familiarity !== '0',
      default: 's',
      choices: [
        { name: 'S — Fast Lane (bugfixes, ≤3 files)', value: 's' },
        { name: 'M — Standard (v1.1+ — use legacy `init` for now)', value: 'm' },
        { name: 'L — Full (v1.1+ — use legacy `init` for now)', value: 'l' },
      ],
    },
    {
      type: 'input',
      name: 'testCommand',
      message: 'Test command?',
      when: (a) => a.familiarity !== '0',
      default: (a) => cmdDefaults.test ?? STACK_DEFAULTS[a.techStack]?.test ?? '',
    },
    {
      type: 'input',
      name: 'typeCheckCommand',
      message: 'Type-check command? (leave blank if none)',
      when: (a) =>
        a.familiarity !== '0' && (a.techStack === 'node-ts' || a.techStack === 'node-js'),
      default: (a) => cmdDefaults.type_check ?? STACK_DEFAULTS[a.techStack]?.type_check ?? '',
    },
    {
      type: 'input',
      name: 'devCommand',
      message: 'Dev command? (leave blank if none)',
      when: (a) => a.familiarity !== '0',
      default: (a) => cmdDefaults.dev ?? STACK_DEFAULTS[a.techStack]?.dev ?? '',
    },
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
  ];
}

/**
 * Build the schema v1 frontmatter from dev wizard answers + optional
 * algo / phase-2 outputs (for existing-mode runs).
 */
export function buildDevFrontmatter({ answers, mode, generatedByVersion, algoOutput, phase2 }) {
  const tierSelected = answers.tier ?? (answers.familiarity === '0' ? '0' : 's');
  const isTier0 = tierSelected === '0';
  const stackKey = answers.techStack ?? 'other';
  const stackDefaults = STACK_DEFAULTS[stackKey] ?? STACK_DEFAULTS.other;

  // Description: PM-typed in greenfield, LLM-extracted in existing
  let description = answers.description?.trim();
  if (!description && phase2?.description) description = phase2.description;
  if (!description) description = `(${stackKey} project)`;

  const commands = {
    install: algoOutput?.draft?.commands?.install ?? stackDefaults.install ?? '',
    test:
      answers.testCommand?.trim() || algoOutput?.draft?.commands?.test || stackDefaults.test || '',
  };
  // Optional fields
  if (answers.typeCheckCommand !== undefined) {
    commands.type_check =
      answers.typeCheckCommand.trim() === '' ? null : answers.typeCheckCommand.trim();
  } else if (algoOutput?.draft?.commands?.type_check) {
    commands.type_check = algoOutput.draft.commands.type_check;
  } else if (stackDefaults.type_check) {
    commands.type_check = stackDefaults.type_check;
  }
  if (answers.devCommand !== undefined) {
    commands.dev = answers.devCommand.trim() === '' ? null : answers.devCommand.trim();
  } else if (algoOutput?.draft?.commands?.dev) {
    commands.dev = algoOutput.draft.commands.dev;
  } else if (stackDefaults.dev) {
    commands.dev = stackDefaults.dev;
  }

  const rationale =
    phase2?.tier_rationale_hint?.trim() ||
    deriveDevRationale({
      familiarity: answers.familiarity,
      teamSize: answers.teamSize,
      workScope: answers.workScope,
    });

  const fm = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    generated_by: 'context-builder',
    generated_by_version: generatedByVersion ?? '1.0.0',
    project: {
      name: answers.projectName,
      description,
      mode,
    },
    stack: { primary: stackKey },
    commands,
    tier: { selected: tierSelected, rationale },
    scaffold_options: {
      include_pre_commit: isTier0 ? false : (answers.includePreCommit ?? true),
      include_github: isTier0 ? false : (answers.includeGithub ?? false),
    },
  };

  if (mode === 'in-place' || mode === 'from-context') {
    if (algoOutput) {
      fm.inference = {
        source_files: algoOutput.source_files,
        confidence: algoOutput.confidence,
      };
    }
    if (algoOutput?.pending_decisions?.length > 0) {
      fm.pending_decisions = algoOutput.pending_decisions;
    }
  }

  return fm;
}

function extractBodySectionsFromPhase2(phase2) {
  if (!phase2) return null;
  return {
    what_building: phase2.body_what_building ?? '',
    operational_constraints: phase2.body_operational_constraints ?? '',
    open_questions: phase2.body_open_questions ?? '',
  };
}

/**
 * Run the dev interview and return { frontmatter, body }.
 * Phase 2 LLM is attempted for existing-mode runs but silently skipped on error.
 *
 * @param {object} options
 * @param {string} options.mode               'greenfield' | 'in-place' | 'from-context'
 * @param {string} [options.cwd]              project root for inference
 * @param {string} [options.projectNameDefault]
 * @param {string} [options.generatedByVersion]
 * @param {object} [options.prefilledAnswers] bypass inquirer (tests / scripting)
 * @param {Function} [options.llmClient]      override Phase 2 LLM (tests)
 * @param {boolean}  [options.skipLlm]        skip Phase 2 entirely
 */
export async function runDevInterview(options = {}) {
  const mode = options.mode ?? 'greenfield';

  let algoOutput = null;
  if (mode !== 'greenfield' && options.cwd) {
    algoOutput = await runAlgoInference(options.cwd);
  }

  const questions = assembleDevQuestions({
    mode,
    projectNameDefault: options.projectNameDefault,
    algoDefaults: algoOutput?.draft,
  });

  const answers = options.prefilledAnswers ?? (await inquirer.prompt(questions));

  if (HARD_STOP_TIERS.includes(answers.tier)) {
    const err = new Error(
      `Tier ${answers.tier.toUpperCase()} not supported in v1. Use \`npx mg-claude-dev-kit init\` (legacy wizard) instead.`,
    );
    err.code = 'TIER_NOT_SUPPORTED_V1';
    throw err;
  }

  let phase2 = null;
  if (mode !== 'greenfield' && !options.skipLlm && algoOutput) {
    try {
      phase2 = await extractWithLlm({
        dir: options.cwd,
        draft: algoOutput.draft,
        llmClient: options.llmClient,
      });
    } catch {
      // Silent skip: dev must not be blocked by missing keys / network errors.
      phase2 = null;
    }
  }

  // Merge Phase 2 pending_decisions into algo's, if any
  if (phase2 && algoOutput) {
    const merged = mergeLlmIntoDraft(algoOutput.draft, phase2, algoOutput.pending_decisions);
    algoOutput = {
      ...algoOutput,
      pending_decisions: merged.pending_decisions,
    };
  }

  const frontmatter = buildDevFrontmatter({
    answers,
    mode,
    generatedByVersion: options.generatedByVersion,
    algoOutput,
    phase2,
  });

  const phase2Sections = extractBodySectionsFromPhase2(phase2);
  const body = phase2Sections
    ? (composeBodyMarkdown(phase2Sections) ?? DEFAULT_BODY)
    : DEFAULT_BODY;

  return { frontmatter, body };
}
