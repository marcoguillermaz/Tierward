import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFrontmatterFromAnswers,
  composeBodyFromAnswers,
  suggestTier,
  runPmInterview,
  STACK_DEFAULTS,
  HARD_STOP_TIERS,
} from '../../../src/context-builder/interview/pm-flow.js';
import { validateContextContent } from '../../../src/utils/validate-context.js';
import { serializeContext } from '../../../src/context-builder/writer.js';

const baseExperienced = {
  familiarity: 'experienced',
  projectName: 'demo',
  description: 'A test app',
  techStack: 'node-ts',
  teamSize: 'solo',
  workScope: 'bugfix',
  tier: 's',
  tierRationale: 'Solo dev, bugfixes',
  installCommand: 'npm install',
  testCommand: 'npx vitest run',
  typeCheckCommand: 'npx tsc --noEmit',
  devCommand: 'npm run dev',
  includePreCommit: true,
  includeGithub: false,
  bodyWhatBuilding: '',
  bodyConstraints: '',
  bodyOpenQuestions: '',
};

describe('suggestTier', () => {
  it('routes familiarity=0 to tier 0', () => {
    assert.equal(suggestTier({ familiarity: '0' }), '0');
  });

  it('routes bugfix to s', () => {
    assert.equal(suggestTier({ familiarity: 'experienced', workScope: 'bugfix' }), 's');
  });

  it('routes complex to l', () => {
    assert.equal(suggestTier({ familiarity: 'experienced', workScope: 'complex' }), 'l');
  });

  it('routes large team to l', () => {
    assert.equal(
      suggestTier({ familiarity: 'experienced', teamSize: 'large', workScope: 'feature' }),
      'l',
    );
  });

  it('defaults to m otherwise', () => {
    assert.equal(
      suggestTier({ familiarity: 'experienced', teamSize: 'small', workScope: 'feature' }),
      'm',
    );
  });
});

describe('buildFrontmatterFromAnswers', () => {
  it('produces a schema-valid greenfield frontmatter', () => {
    const fm = buildFrontmatterFromAnswers(baseExperienced, { mode: 'greenfield' });
    const result = validateContextContent(serializeContext(fm));
    assert.equal(result.valid, true, `errors: ${JSON.stringify(result.errors)}`);
  });

  it('forces scaffold options to false when tier=0', () => {
    const a = {
      ...baseExperienced,
      familiarity: '0',
      tier: undefined,
      includePreCommit: true,
      includeGithub: true,
    };
    const fm = buildFrontmatterFromAnswers(a, { mode: 'greenfield' });
    assert.equal(fm.tier.selected, '0');
    assert.equal(fm.scaffold_options.include_pre_commit, false);
    assert.equal(fm.scaffold_options.include_github, false);
  });

  it('uses STACK_DEFAULTS when commands are omitted', () => {
    const a = {
      ...baseExperienced,
      installCommand: undefined,
      testCommand: undefined,
      devCommand: undefined,
    };
    const fm = buildFrontmatterFromAnswers(a, { mode: 'greenfield' });
    assert.equal(fm.commands.install, STACK_DEFAULTS['node-ts'].install);
    assert.equal(fm.commands.test, STACK_DEFAULTS['node-ts'].test);
    assert.equal(fm.commands.dev, STACK_DEFAULTS['node-ts'].dev);
  });

  it('emits null for type_check when answer is empty string', () => {
    const a = { ...baseExperienced, typeCheckCommand: '' };
    const fm = buildFrontmatterFromAnswers(a, { mode: 'greenfield' });
    assert.equal(fm.commands.type_check, null);
  });

  it('omits type_check field for non-node-ts stacks when answer absent', () => {
    const a = {
      ...baseExperienced,
      techStack: 'python',
      typeCheckCommand: undefined,
      installCommand: 'pip install -r requirements.txt',
      testCommand: 'pytest',
      devCommand: 'uvicorn main:app --reload',
    };
    const fm = buildFrontmatterFromAnswers(a, { mode: 'greenfield' });
    assert.equal(fm.commands.type_check, undefined);
  });

  it('sets generated_by_version from ctx', () => {
    const fm = buildFrontmatterFromAnswers(baseExperienced, {
      mode: 'greenfield',
      generatedByVersion: '1.22.0',
    });
    assert.equal(fm.generated_by_version, '1.22.0');
  });

  it('sets generated_at to a valid ISO datetime', () => {
    const fm = buildFrontmatterFromAnswers(baseExperienced, { mode: 'greenfield' });
    assert.ok(!Number.isNaN(Date.parse(fm.generated_at)));
  });

  it('sets project.mode from ctx', () => {
    const fm = buildFrontmatterFromAnswers(baseExperienced, { mode: 'in-place' });
    assert.equal(fm.project.mode, 'in-place');
  });
});

describe('composeBodyFromAnswers', () => {
  it('returns undefined when all prose answers are empty', () => {
    const body = composeBodyFromAnswers({
      bodyWhatBuilding: '',
      bodyConstraints: '',
      bodyOpenQuestions: '',
    });
    assert.equal(body, undefined);
  });

  it('returns custom body when any prose answer is provided', () => {
    const body = composeBodyFromAnswers({
      bodyWhatBuilding: 'A task tracker',
      bodyConstraints: '',
      bodyOpenQuestions: '',
    });
    assert.ok(body.includes('A task tracker'));
    assert.ok(body.includes('## What we are building'));
    assert.ok(body.includes('## Operational constraints'));
    assert.ok(body.includes('## Open questions'));
  });

  it('placeholder appears for empty sections when partial prose provided', () => {
    const body = composeBodyFromAnswers({
      bodyWhatBuilding: 'X',
      bodyConstraints: '',
      bodyOpenQuestions: 'open Y',
    });
    assert.ok(body.includes('X'));
    assert.ok(body.includes('open Y'));
    assert.ok(body.includes('[Deadlines'));
  });
});

describe('runPmInterview (prefilledAnswers)', () => {
  it('produces a round-trip-valid CONTEXT.md for greenfield S', async () => {
    const { frontmatter, body } = await runPmInterview({
      mode: 'greenfield',
      prefilledAnswers: baseExperienced,
    });
    const out = serializeContext(frontmatter, body);
    const result = validateContextContent(out);
    assert.equal(result.valid, true, `errors: ${JSON.stringify(result.errors)}`);
  });

  it('produces a round-trip-valid CONTEXT.md for tier 0', async () => {
    const { frontmatter, body } = await runPmInterview({
      mode: 'greenfield',
      prefilledAnswers: {
        familiarity: '0',
        projectName: 'first',
        description: 'My first project',
        techStack: 'node-ts',
        tierRationale: 'Just starting',
        bodyWhatBuilding: '',
        bodyConstraints: '',
        bodyOpenQuestions: '',
      },
    });
    const out = serializeContext(frontmatter, body);
    const result = validateContextContent(out);
    assert.equal(result.valid, true, `errors: ${JSON.stringify(result.errors)}`);
    assert.equal(frontmatter.tier.selected, '0');
  });

  it('accepts tier=m in v1.27.0+ (no hard stop)', async () => {
    const { frontmatter, body } = await runPmInterview({
      mode: 'greenfield',
      prefilledAnswers: {
        ...baseExperienced,
        tier: 'm',
        hasApi: true,
        hasDatabase: true,
        hasFrontend: true,
        hasDesignSystem: true,
        designSystemName: 'shadcn/ui',
        hasPrd: false,
        auditModel: 'claude-sonnet-4-6',
        e2eCommand: 'npx playwright test',
      },
    });
    const result = validateContextContent(serializeContext(frontmatter, body));
    assert.equal(result.valid, true, `errors: ${JSON.stringify(result.errors)}`);
    assert.equal(frontmatter.tier.selected, 'm');
    assert.equal(frontmatter.features.has_api, true);
    assert.equal(frontmatter.features.design_system_name, 'shadcn/ui');
    assert.equal(frontmatter.audit_model, 'claude-sonnet-4-6');
  });

  it('accepts tier=l in v1.27.0+', async () => {
    const { frontmatter } = await runPmInterview({
      mode: 'greenfield',
      prefilledAnswers: {
        ...baseExperienced,
        tier: 'l',
        hasApi: false,
        hasDatabase: true,
        hasFrontend: false,
        hasPrd: true,
      },
    });
    assert.equal(frontmatter.tier.selected, 'l');
    assert.equal(frontmatter.features.has_prd, true);
  });
});

describe('HARD_STOP_TIERS export', () => {
  it('is empty in v1.27.0+ (tier M/L are supported)', () => {
    assert.deepEqual([...HARD_STOP_TIERS], []);
  });
});
