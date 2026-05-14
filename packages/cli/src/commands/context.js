/**
 * `context` sub-command — generate CONTEXT.md.
 *
 * Two paths:
 *   - greenfield → interactive interview (PM flow or dev-flow stub)
 *   - existing   → Phase 1 algo inference + Phase 2 LLM extraction + Phase 3 review
 *
 * After writing CONTEXT.md, the file is validated against schema v1.
 * If --all is set, control is handed to `init` which reads the file
 * and scaffolds.
 *
 * See memory: project_context_builder_implementation_v1.md (step 9)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';
import chalk from 'chalk';
import ora from 'ora';

import { askPersona, routePersona } from '../context-builder/persona.js';
import { runPmInterview } from '../context-builder/interview/pm-flow.js';
import { runDevInterview } from '../context-builder/interview/dev-flow.js';
import { runAlgoInference } from '../context-builder/inference/algo.js';
import { extractWithLlm } from '../context-builder/inference/llm.js';
import {
  mergeLlmIntoDraft,
  runInteractiveReview,
  runProseReviewForExisting,
  composeBodyMarkdown,
} from '../context-builder/inference/review.js';
import { writeContextFile, DEFAULT_BODY } from '../context-builder/writer.js';
import { validateContextFile, validateContextContent } from '../utils/validate-context.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_PATH = path.resolve(__dirname, '../../package.json');

async function readPackageVersion() {
  const pkg = await fs.readJson(PKG_PATH).catch(() => ({ version: '1.0.0' }));
  return pkg.version ?? '1.0.0';
}

async function detectMode(cwd) {
  const indicators = [
    'package.json',
    'pyproject.toml',
    'go.mod',
    'Cargo.toml',
    'Gemfile',
    'pom.xml',
    'build.gradle',
    'build.gradle.kts',
    'Package.swift',
  ];
  for (const f of indicators) {
    if (await fs.pathExists(path.join(cwd, f))) return 'in-place';
  }
  return 'greenfield';
}

function composeFinalFrontmatter(reviewed, ctx) {
  const fm = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    generated_by: 'context-builder',
    generated_by_version: ctx.generatedByVersion,
    project: {
      name: reviewed.draft.project?.name ?? '',
      description: reviewed.draft.project?.description ?? '',
      mode: ctx.mode,
    },
    stack: { primary: reviewed.draft.stack?.primary ?? 'other' },
    commands: {
      install: reviewed.draft.commands?.install ?? '',
      test: reviewed.draft.commands?.test ?? '',
    },
    tier: {
      selected: reviewed.draft.tier?.selected ?? 's',
      rationale: reviewed.draft.tier?.rationale ?? '',
    },
    scaffold_options: {
      include_pre_commit: Boolean(reviewed.draft.scaffold_options?.include_pre_commit),
      include_github: Boolean(reviewed.draft.scaffold_options?.include_github),
    },
  };

  if (reviewed.draft.commands?.type_check !== undefined) {
    fm.commands.type_check = reviewed.draft.commands.type_check;
  }
  if (reviewed.draft.commands?.dev !== undefined) {
    fm.commands.dev = reviewed.draft.commands.dev;
  }

  // Tier-0 inter-field invariant (C1)
  if (fm.tier.selected === '0') {
    fm.scaffold_options.include_pre_commit = false;
    fm.scaffold_options.include_github = false;
  }

  if (ctx.mode === 'in-place' || ctx.mode === 'from-context') {
    fm.inference = {
      source_files: ctx.sourceFiles,
      confidence: reviewed.confidence,
    };
  }

  if (reviewed.pending_decisions?.length > 0) {
    fm.pending_decisions = reviewed.pending_decisions;
  }

  return fm;
}

/**
 * Wrap raw YAML (no `---` delimiters) into a minimal CONTEXT.md skeleton
 * with the DEFAULT_BODY placeholder. Markdown files with their own
 * frontmatter are passed through untouched.
 */
export function normalizeFromYamlSource(content) {
  if (content.startsWith('---\n')) return content;
  return `---\n${content.replace(/\n+$/, '')}\n---\n\n${DEFAULT_BODY}`;
}

/**
 * --from-yaml bypass: validate an existing CONTEXT.md / YAML config and
 * copy it into the cwd. Skips interview, inference, and review entirely.
 *
 * Use cases: CI / automation, expert dev with a hand-edited file,
 * template sharing across projects.
 *
 * @param {object} args
 * @param {string} args.sourcePath - Path to the source file
 * @param {string} args.cwd        - Target cwd (CONTEXT.md will be written here)
 * @param {boolean} [args.silent]
 * @param {boolean} [args.throwOnInvalid] - throw instead of process.exit(1)
 * @returns {Promise<{ path: string, data: object }>}
 */
export async function runFromYamlBypass({ sourcePath, cwd, silent, throwOnInvalid }) {
  const resolvedSource = path.resolve(sourcePath);
  if (!(await fs.pathExists(resolvedSource))) {
    const msg = `Source file not found: ${resolvedSource}`;
    if (throwOnInvalid) {
      const e = new Error(msg);
      e.code = 'FROM_YAML_SOURCE_MISSING';
      throw e;
    }
    console.error(chalk.red(msg));
    process.exit(1);
  }

  const rawContent = await fs.readFile(resolvedSource, 'utf8');
  const normalized = normalizeFromYamlSource(rawContent);
  const validation = validateContextContent(normalized);

  if (!validation.valid) {
    if (!silent) {
      console.error(chalk.red(`✗ ${path.basename(resolvedSource)} failed validation:`));
      for (const err of validation.errors) {
        const dotted = err.path?.length ? err.path.join('.') : '(root)';
        console.error(`  [${err.code}] ${dotted}: ${err.message}`);
      }
    }
    if (throwOnInvalid) {
      const e = new Error('CONTEXT.md validation failed');
      e.code = 'INVALID_CONTEXT';
      e.errors = validation.errors;
      throw e;
    }
    process.exit(1);
  }

  const targetPath = path.join(cwd, 'CONTEXT.md');
  await fs.writeFile(targetPath, normalized, 'utf8');
  if (!silent) {
    console.log(
      chalk.green(
        `✓ Wrote ${path.relative(cwd, targetPath) || 'CONTEXT.md'} from ${path.relative(cwd, resolvedSource) || resolvedSource}`,
      ),
    );
    console.log(chalk.green('✓ Schema validation passed'));
  }

  return { path: targetPath, data: validation.data, body: validation.body };
}

/**
 * Run the `context` sub-command.
 *
 * @param {object} options
 * @param {string} [options.mode] - Override mode auto-detection
 * @param {string} [options.persona] - Bypass Q1 persona prompt
 * @param {string} [options.fromYaml] - Path to source file → bypass interview
 * @param {object} [options.prefilledAnswers] - For non-interactive runs (tests)
 * @param {Array}  [options.prefilledReviewAnswers] - Phase 3 prefilled review
 * @param {Function} [options.llmClient] - Override LLM client (tests)
 * @param {boolean}  [options.skipLlm] - Skip Phase 2 (offline runs)
 * @param {boolean}  [options.all] - Auto-chain `init` after writing CONTEXT.md
 * @param {string}   [options.cwd] - Override cwd (tests)
 */
export async function contextCommand(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const targetPath = path.join(cwd, 'CONTEXT.md');
  const generatedByVersion = await readPackageVersion();

  // ── --from-yaml bypass: validate + copy, no interview ──────────────
  if (options.fromYaml) {
    const out = await runFromYamlBypass({
      sourcePath: options.fromYaml,
      cwd,
      silent: options.silent,
      throwOnInvalid: options.throwOnInvalid,
    });

    if (options.all) {
      if (!options.silent) {
        console.log();
        console.log(chalk.dim('Auto-chaining `init` (--all flag)…'));
      }
      const { init } = await import('./init.js');
      await init({ ...options, useContext: true });
    }
    return out;
  }

  console.log();
  console.log(
    chalk.bold('claude-dev-kit context') +
      chalk.dim(' — generate CONTEXT.md from interview/inference'),
  );
  console.log();

  const mode = options.mode ?? (await detectMode(cwd));

  const persona = await askPersona({ prefilled: options.persona });
  const flow = routePersona(persona);

  let frontmatter;
  let body;

  if (mode === 'greenfield') {
    const interview =
      flow === 'dev'
        ? await runDevInterview({
            mode,
            cwd,
            generatedByVersion,
            prefilledAnswers: options.prefilledAnswers,
            llmClient: options.llmClient,
            skipLlm: options.skipLlm,
            projectNameDefault: path.basename(cwd),
          })
        : await runPmInterview({
            mode,
            generatedByVersion,
            prefilledAnswers: options.prefilledAnswers,
            projectNameDefault: path.basename(cwd),
          });
    frontmatter = interview.frontmatter;
    body = interview.body;
  } else if (flow === 'dev') {
    const interview = await runDevInterview({
      mode,
      cwd,
      generatedByVersion,
      prefilledAnswers: options.prefilledAnswers,
      llmClient: options.llmClient,
      skipLlm: options.skipLlm,
      projectNameDefault: path.basename(cwd),
    });
    frontmatter = interview.frontmatter;
    body = interview.body;
  } else {
    const spinner = ora({ isSilent: options.silent }).start('Phase 1: Algorithmic detection...');
    const algo = await runAlgoInference(cwd);
    spinner.succeed(`Phase 1: ${algo.source_files.length} files analyzed`);

    let phase2 = { description: '', tier_rationale_hint: '', pending_decisions: [] };
    if (!options.skipLlm) {
      const s2 = ora({ isSilent: options.silent }).start('Phase 2: LLM extraction...');
      try {
        phase2 = await extractWithLlm({
          dir: cwd,
          draft: algo.draft,
          llmClient: options.llmClient,
        });
        s2.succeed('Phase 2: semantic extraction done');
      } catch (e) {
        s2.warn(`Phase 2 skipped: ${e.message}`);
      }
    }

    const merged = mergeLlmIntoDraft(algo.draft, phase2, algo.pending_decisions);
    let state = {
      draft: merged.draft,
      confidence: algo.confidence,
      pending_decisions: merged.pending_decisions,
      body_sections: merged.body_sections,
    };

    state = await runProseReviewForExisting(state, {
      prefilledProse: options.prefilledProse,
    });

    const reviewed = await runInteractiveReview(state, {
      prefilledAnswers: options.prefilledReviewAnswers,
    });
    reviewed.body_sections = state.body_sections;

    frontmatter = composeFinalFrontmatter(reviewed, {
      mode,
      generatedByVersion,
      sourceFiles: algo.source_files,
    });
    body = composeBodyMarkdown(state.body_sections) ?? DEFAULT_BODY;
  }

  writeContextFile(targetPath, frontmatter, body);
  if (!options.silent) {
    console.log(chalk.green(`✓ Wrote ${path.relative(cwd, targetPath) || 'CONTEXT.md'}`));
  }

  const validation = validateContextFile(targetPath);
  if (!validation.valid) {
    console.error(chalk.red('CONTEXT.md validation failed:'));
    for (const err of validation.errors) {
      console.error(`  ${err.path.join('.') || '(root)'}: ${err.message}`);
    }
    if (options.throwOnInvalid) {
      const e = new Error('CONTEXT.md validation failed');
      e.code = 'INVALID_CONTEXT';
      e.errors = validation.errors;
      throw e;
    }
    process.exit(1);
  }
  if (!options.silent) {
    console.log(chalk.green('✓ Schema validation passed'));
  }

  if (options.all) {
    if (!options.silent) {
      console.log();
      console.log(chalk.dim('Auto-chaining `init` (--all flag)…'));
    }
    const { init } = await import('./init.js');
    await init({ ...options, useContext: true });
  }

  return { path: targetPath, frontmatter, body, data: validation.data };
}
