import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runDevInterview,
  buildDevFrontmatter,
  assembleDevQuestions,
  HARD_STOP_TIERS,
} from '../../../src/context-builder/interview/dev-flow.js';
import { deriveDevRationale } from '../../../src/context-builder/interview/shared/derive-rationale.js';
import { validateContextContent } from '../../../src/utils/validate-context.js';
import { serializeContext } from '../../../src/context-builder/writer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPOS = path.resolve(__dirname, '../../fixtures/context-builder/repos');

const baseGreenfield = {
  familiarity: 'experienced',
  projectName: 'dev-test',
  description: 'A short dev description',
  techStack: 'node-ts',
  teamSize: 'solo',
  workScope: 'bugfix',
  tier: 's',
  testCommand: 'npx vitest run',
  typeCheckCommand: 'npx tsc --noEmit',
  devCommand: 'npm run dev',
  includePreCommit: true,
  includeGithub: false,
};

describe('deriveDevRationale', () => {
  it('routes familiarity=0 to "Brand new" string', () => {
    assert.equal(deriveDevRationale({ familiarity: '0' }), 'Brand new to Claude Code, exploring');
  });

  it('composes team+scope for experienced solo + bugfix', () => {
    assert.equal(
      deriveDevRationale({ familiarity: 'experienced', teamSize: 'solo', workScope: 'bugfix' }),
      'Solo developer, bugfix-sized changes (≤3 files)',
    );
  });

  it('composes team+scope for small team + feature', () => {
    assert.equal(
      deriveDevRationale({ familiarity: 'experienced', teamSize: 'small', workScope: 'feature' }),
      'Small team, feature-block work (1-2 week chunks)',
    );
  });

  it('handles complex scope for large team', () => {
    assert.equal(
      deriveDevRationale({ familiarity: 'experienced', teamSize: 'large', workScope: 'complex' }),
      'Larger team, complex domain changes',
    );
  });
});

describe('buildDevFrontmatter', () => {
  it('produces a schema-valid greenfield frontmatter', () => {
    const fm = buildDevFrontmatter({
      answers: baseGreenfield,
      mode: 'greenfield',
      generatedByVersion: '1.23.0',
    });
    const result = validateContextContent(serializeContext(fm));
    assert.equal(result.valid, true, `errors: ${JSON.stringify(result.errors)}`);
  });

  it('auto-derives tier.rationale (no PM-supplied rationale)', () => {
    const fm = buildDevFrontmatter({
      answers: baseGreenfield,
      mode: 'greenfield',
      generatedByVersion: '1.23.0',
    });
    assert.equal(fm.tier.rationale, 'Solo developer, bugfix-sized changes (≤3 files)');
  });

  it('forces tier=0 scaffold options to false', () => {
    const fm = buildDevFrontmatter({
      answers: {
        ...baseGreenfield,
        familiarity: '0',
        tier: undefined,
        includePreCommit: true,
        includeGithub: true,
      },
      mode: 'greenfield',
      generatedByVersion: '1.23.0',
    });
    assert.equal(fm.tier.selected, '0');
    assert.equal(fm.scaffold_options.include_pre_commit, false);
    assert.equal(fm.scaffold_options.include_github, false);
  });

  it('treats empty type_check command as null', () => {
    const fm = buildDevFrontmatter({
      answers: { ...baseGreenfield, typeCheckCommand: '' },
      mode: 'greenfield',
      generatedByVersion: '1.23.0',
    });
    assert.equal(fm.commands.type_check, null);
  });

  it('treats empty dev command as null', () => {
    const fm = buildDevFrontmatter({
      answers: { ...baseGreenfield, devCommand: '' },
      mode: 'greenfield',
      generatedByVersion: '1.23.0',
    });
    assert.equal(fm.commands.dev, null);
  });

  it('injects mode from context', () => {
    const fm = buildDevFrontmatter({
      answers: baseGreenfield,
      mode: 'in-place',
      generatedByVersion: '1.23.0',
      algoOutput: { source_files: ['package.json'], confidence: { 'stack.primary': 'high' } },
    });
    assert.equal(fm.project.mode, 'in-place');
    assert.deepEqual(fm.inference.source_files, ['package.json']);
  });

  it('uses Phase 2 description when greenfield answer is missing', () => {
    const fm = buildDevFrontmatter({
      answers: { ...baseGreenfield, description: undefined },
      mode: 'in-place',
      generatedByVersion: '1.23.0',
      algoOutput: {
        source_files: ['package.json'],
        confidence: { 'stack.primary': 'high' },
      },
      phase2: { description: 'LLM-extracted description', tier_rationale_hint: '' },
    });
    assert.equal(fm.project.description, 'LLM-extracted description');
  });
});

describe('assembleDevQuestions', () => {
  it('omits description prompt for in-place mode', () => {
    const qs = assembleDevQuestions({ mode: 'in-place' });
    const descQ = qs.find((q) => q.name === 'description');
    assert.ok(descQ.when, 'description question should be guarded by when()');
    assert.equal(descQ.when({}), false, 'description.when() should return false for in-place');
  });

  it('shows description prompt for greenfield mode', () => {
    const qs = assembleDevQuestions({ mode: 'greenfield' });
    const descQ = qs.find((q) => q.name === 'description');
    assert.equal(descQ.when({}), true);
  });

  it('hides diagnostic + tier prompts when familiarity=0', () => {
    const qs = assembleDevQuestions({ mode: 'greenfield' });
    for (const name of ['teamSize', 'workScope', 'tier']) {
      const q = qs.find((x) => x.name === name);
      assert.equal(
        q.when({ familiarity: '0' }),
        false,
        `${name} should be hidden when familiarity=0`,
      );
    }
  });

  it('does NOT prompt for tier.rationale or body prose (dev flow)', () => {
    const qs = assembleDevQuestions({ mode: 'greenfield' });
    const names = qs.map((q) => q.name);
    assert.ok(!names.includes('tierRationale'), 'dev flow must not prompt for tierRationale');
    assert.ok(!names.includes('bodyWhatBuilding'));
    assert.ok(!names.includes('bodyConstraints'));
    assert.ok(!names.includes('bodyOpenQuestions'));
  });
});

describe('runDevInterview — greenfield', () => {
  it('produces a round-trip-valid CONTEXT.md', async () => {
    const { frontmatter, body } = await runDevInterview({
      mode: 'greenfield',
      generatedByVersion: '1.23.0',
      prefilledAnswers: baseGreenfield,
    });
    const out = serializeContext(frontmatter, body);
    const result = validateContextContent(out);
    assert.equal(result.valid, true, `errors: ${JSON.stringify(result.errors)}`);
    // Body falls back to DEFAULT_BODY (no Phase 2 in greenfield, no prose)
    assert.ok(body.includes('## What we are building'));
  });

  it('produces valid tier-0 CONTEXT.md when familiarity=0', async () => {
    const { frontmatter, body } = await runDevInterview({
      mode: 'greenfield',
      generatedByVersion: '1.23.0',
      prefilledAnswers: {
        familiarity: '0',
        projectName: 'first',
        description: 'My first project',
        techStack: 'node-ts',
      },
    });
    const out = serializeContext(frontmatter, body);
    const result = validateContextContent(out);
    assert.equal(result.valid, true, `errors: ${JSON.stringify(result.errors)}`);
    assert.equal(frontmatter.tier.selected, '0');
    assert.equal(frontmatter.tier.rationale, 'Brand new to Claude Code, exploring');
  });

  it('accepts tier=m in v1.27.0+ with feature flags', async () => {
    const { frontmatter, body } = await runDevInterview({
      mode: 'greenfield',
      generatedByVersion: '1.27.0',
      prefilledAnswers: {
        ...baseGreenfield,
        tier: 'm',
        hasApi: true,
        hasDatabase: false,
        hasFrontend: true,
        hasDesignSystem: true,
        designSystemName: 'Tailwind',
        hasPrd: false,
      },
    });
    const result = validateContextContent(serializeContext(frontmatter, body));
    assert.equal(result.valid, true, `errors: ${JSON.stringify(result.errors)}`);
    assert.equal(frontmatter.tier.selected, 'm');
    assert.equal(frontmatter.features.design_system_name, 'Tailwind');
  });

  it('accepts tier=l in v1.27.0+', async () => {
    const { frontmatter } = await runDevInterview({
      mode: 'greenfield',
      generatedByVersion: '1.27.0',
      prefilledAnswers: { ...baseGreenfield, tier: 'l', hasDatabase: true, hasFrontend: false },
    });
    assert.equal(frontmatter.tier.selected, 'l');
  });
});

describe('runDevInterview — existing mode', () => {
  it('produces a valid in-place CONTEXT.md via algo inference (skipLlm)', async () => {
    const { frontmatter, body } = await runDevInterview({
      mode: 'in-place',
      cwd: path.join(REPOS, 'node-ts-app'),
      generatedByVersion: '1.23.0',
      skipLlm: true,
      prefilledAnswers: {
        ...baseGreenfield,
        projectName: 'node-ts-app',
        description: undefined, // existing-mode does not prompt for description
      },
    });
    const out = serializeContext(frontmatter, body);
    const result = validateContextContent(out);
    assert.equal(result.valid, true, `errors: ${JSON.stringify(result.errors)}`);
    assert.equal(frontmatter.project.mode, 'in-place');
    assert.ok(frontmatter.inference.source_files.includes('package.json'));
  });

  it('silently skips Phase 2 LLM on client error (no blocking for dev)', async () => {
    const erroringClient = async () => {
      throw new Error('simulated LLM outage');
    };
    const { frontmatter, body } = await runDevInterview({
      mode: 'in-place',
      cwd: path.join(REPOS, 'node-ts-app'),
      generatedByVersion: '1.23.0',
      llmClient: erroringClient,
      prefilledAnswers: {
        ...baseGreenfield,
        projectName: 'node-ts-app',
        description: undefined,
      },
    });
    // Validation should still pass — body falls back to DEFAULT_BODY
    const result = validateContextContent(serializeContext(frontmatter, body));
    assert.equal(result.valid, true);
    assert.ok(body.includes('## What we are building'));
  });

  it('uses Phase 2 body sections when LLM succeeds', async () => {
    const goodClient = async () =>
      JSON.stringify({
        description: 'LLM description',
        tier_rationale_hint: 'LLM rationale',
        pending_decisions: [],
        body_what_building: 'Real what-building text',
        body_operational_constraints: 'Real constraints',
        body_open_questions: 'Real open Q',
      });
    const { frontmatter, body } = await runDevInterview({
      mode: 'in-place',
      cwd: path.join(REPOS, 'node-ts-app'),
      generatedByVersion: '1.23.0',
      llmClient: goodClient,
      prefilledAnswers: {
        ...baseGreenfield,
        projectName: 'node-ts-app',
        description: undefined,
      },
    });
    assert.ok(body.includes('Real what-building text'));
    assert.ok(body.includes('Real constraints'));
    // tier.rationale prefers LLM hint when available
    assert.equal(frontmatter.tier.rationale, 'LLM rationale');
  });
});

describe('HARD_STOP_TIERS', () => {
  it('is empty in v1.27.0+ (tier M/L are supported)', () => {
    assert.deepEqual([...HARD_STOP_TIERS], []);
  });
});
