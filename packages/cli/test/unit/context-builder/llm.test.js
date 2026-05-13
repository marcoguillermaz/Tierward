import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildRepoSummary,
  buildExtractionPrompt,
  parseLlmResponse,
  extractWithLlm,
} from '../../../src/context-builder/inference/llm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPOS = path.resolve(__dirname, '../../fixtures/context-builder/repos');

describe('buildRepoSummary', () => {
  it('includes README content when present', async () => {
    const summary = await buildRepoSummary(path.join(REPOS, 'empty-other'));
    assert.ok(summary.includes('An empty project'));
  });

  it('includes top-level tree listing', async () => {
    const summary = await buildRepoSummary(path.join(REPOS, 'node-ts-app'));
    assert.ok(summary.includes('Top-level tree'));
    assert.ok(summary.includes('package.json'));
  });

  it('skips node_modules and similar build dirs', async () => {
    const summary = await buildRepoSummary(path.join(REPOS, 'node-ts-app'));
    assert.ok(!summary.includes('node_modules'));
  });

  it('truncates to budget when content exceeds limit', async () => {
    const summary = await buildRepoSummary(path.join(REPOS, 'node-ts-app'), 50);
    assert.ok(summary.length <= 100); // 50 + "[truncated]" marker
    assert.ok(summary.includes('[truncated]'));
  });
});

describe('buildExtractionPrompt', () => {
  it('embeds draft JSON in user prompt', () => {
    const { system, user } = buildExtractionPrompt('summary text', {
      project: { name: 'demo' },
    });
    assert.ok(system.includes('Context Builder'));
    assert.ok(user.includes('"name": "demo"'));
    assert.ok(user.includes('summary text'));
  });

  it('system prompt enumerates valid dotted-paths', () => {
    const { system } = buildExtractionPrompt('', {});
    assert.ok(system.includes('project.description'));
    assert.ok(system.includes('tier.rationale'));
    assert.ok(system.includes('scaffold_options.include_pre_commit'));
  });
});

describe('parseLlmResponse', () => {
  it('parses clean JSON', () => {
    const out = parseLlmResponse(
      '{"description":"x","tier_rationale_hint":"y","pending_decisions":[]}',
    );
    assert.equal(out.description, 'x');
  });

  it('tolerates wrapper prose around JSON', () => {
    const text =
      'Here is the JSON:\n```json\n{"description":"x","tier_rationale_hint":"y","pending_decisions":[]}\n```\nDone.';
    const out = parseLlmResponse(text);
    assert.equal(out.description, 'x');
  });

  it('throws on empty input', () => {
    assert.throws(() => parseLlmResponse(''), /Empty LLM/);
  });

  it('throws when no JSON object present', () => {
    assert.throws(() => parseLlmResponse('Hello world'), /No JSON object/);
  });
});

describe('extractWithLlm (with mock client)', () => {
  const mockClient = async () =>
    JSON.stringify({
      description: 'A small Node project',
      tier_rationale_hint: 'Solo dev with simple bugfixes',
      pending_decisions: [{ field: 'commands.dev', reason: 'unclear from README' }],
    });

  it('returns normalized shape', async () => {
    const out = await extractWithLlm({
      dir: path.join(REPOS, 'node-ts-app'),
      draft: { stack: { primary: 'node-ts' } },
      llmClient: mockClient,
    });
    assert.equal(out.description, 'A small Node project');
    assert.equal(out.tier_rationale_hint, 'Solo dev with simple bugfixes');
    assert.equal(out.pending_decisions.length, 1);
  });

  it('normalizes non-string fields to defaults', async () => {
    const badClient = async () =>
      JSON.stringify({ description: 123, pending_decisions: 'not-array' });
    const out = await extractWithLlm({
      dir: path.join(REPOS, 'node-ts-app'),
      draft: {},
      llmClient: badClient,
    });
    assert.equal(out.description, '');
    assert.equal(out.tier_rationale_hint, '');
    assert.deepEqual(out.pending_decisions, []);
    assert.equal(out.body_what_building, '');
    assert.equal(out.body_operational_constraints, '');
    assert.equal(out.body_open_questions, '');
  });

  it('returns body section fields when LLM emits them', async () => {
    const fullClient = async () =>
      JSON.stringify({
        description: 'd',
        tier_rationale_hint: 'r',
        pending_decisions: [],
        body_what_building: 'building X',
        body_operational_constraints: '2 weeks',
        body_open_questions: 'open Q',
      });
    const out = await extractWithLlm({
      dir: path.join(REPOS, 'node-ts-app'),
      draft: {},
      llmClient: fullClient,
    });
    assert.equal(out.body_what_building, 'building X');
    assert.equal(out.body_operational_constraints, '2 weeks');
    assert.equal(out.body_open_questions, 'open Q');
  });

  it('throws when dir missing', async () => {
    await assert.rejects(extractWithLlm({ draft: {}, llmClient: mockClient }), /dir is required/);
  });

  it('throws when draft missing', async () => {
    await assert.rejects(
      extractWithLlm({ dir: path.join(REPOS, 'node-ts-app'), llmClient: mockClient }),
      /draft is required/,
    );
  });

  it('passes through the model resolution', async () => {
    let captured = null;
    const spy = async (opts) => {
      captured = opts;
      return '{"description":"d","tier_rationale_hint":"r","pending_decisions":[]}';
    };
    await extractWithLlm({
      dir: path.join(REPOS, 'node-ts-app'),
      draft: {},
      llmClient: spy,
      model: 'claude-opus-test',
      apiKey: 'fake-key',
    });
    assert.equal(captured.model, 'claude-opus-test');
    assert.equal(captured.apiKey, 'fake-key');
  });
});
