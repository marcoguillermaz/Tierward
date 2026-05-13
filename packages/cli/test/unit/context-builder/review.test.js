import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDottedPath,
  setDottedPath,
  mergeLlmIntoDraft,
  groupFieldsByConfidence,
  applyReview,
  runInteractiveReview,
  composeBodyMarkdown,
  runProseReviewForExisting,
} from '../../../src/context-builder/inference/review.js';

describe('getDottedPath / setDottedPath', () => {
  it('walks nested path', () => {
    const obj = { a: { b: { c: 42 } } };
    assert.equal(getDottedPath(obj, 'a.b.c'), 42);
  });

  it('returns undefined on missing path', () => {
    assert.equal(getDottedPath({}, 'a.b.c'), undefined);
  });

  it('setDottedPath sets nested value and creates intermediates', () => {
    const obj = {};
    setDottedPath(obj, 'a.b.c', 'hello');
    assert.deepEqual(obj, { a: { b: { c: 'hello' } } });
  });

  // ── Prototype-pollution guard (CodeQL js/prototype-polluting-function) ──

  it('setDottedPath refuses __proto__ segment (throws)', () => {
    assert.throws(() => setDottedPath({}, '__proto__.polluted', 1), /Unsafe dotted-path/);
  });

  it('setDottedPath refuses prototype segment (throws)', () => {
    assert.throws(() => setDottedPath({}, 'a.prototype.polluted', 1), /Unsafe dotted-path/);
  });

  it('setDottedPath refuses constructor segment (throws)', () => {
    assert.throws(() => setDottedPath({}, 'constructor.polluted', 1), /Unsafe dotted-path/);
  });

  it('setDottedPath does not pollute Object.prototype', () => {
    const obj = {};
    try {
      setDottedPath(obj, '__proto__.evil', 'pwned');
    } catch {
      // expected throw
    }
    assert.equal({}.evil, undefined, 'Object.prototype.evil should not be set');
  });

  it('getDottedPath ignores __proto__ segments', () => {
    assert.equal(getDottedPath({}, '__proto__.toString'), undefined);
  });

  it('getDottedPath returns undefined for inherited properties (own-only)', () => {
    class Foo {}
    Foo.prototype.x = 'inherited';
    const f = new Foo();
    assert.equal(getDottedPath(f, 'x'), undefined);
  });
});

describe('mergeLlmIntoDraft', () => {
  it('adds description and rationale into the draft', () => {
    const { draft } = mergeLlmIntoDraft(
      { project: { name: 'x' }, tier: { selected: 's' } },
      { description: 'A test project', tier_rationale_hint: 'Solo dev' },
    );
    assert.equal(draft.project.description, 'A test project');
    assert.equal(draft.tier.rationale, 'Solo dev');
  });

  it('appends LLM pending_decisions to existing list, deduping by field', () => {
    const { pending_decisions } = mergeLlmIntoDraft(
      {},
      {
        pending_decisions: [
          { field: 'commands.dev', reason: 'unclear' },
          { field: 'tier.selected', reason: 'check' },
        ],
      },
      [{ field: 'tier.selected', reason: 'capped from m' }],
    );
    assert.equal(pending_decisions.length, 2);
    assert.equal(pending_decisions[0].field, 'tier.selected');
    assert.equal(pending_decisions[0].reason, 'capped from m');
  });

  it('does not mutate input draft', () => {
    const draft = { project: { name: 'x' } };
    const before = JSON.stringify(draft);
    mergeLlmIntoDraft(draft, { description: 'X' });
    assert.equal(JSON.stringify(draft), before);
  });

  it('extracts body_sections from LLM output', () => {
    const { body_sections } = mergeLlmIntoDraft(
      {},
      {
        body_what_building: 'A task tracker',
        body_operational_constraints: '2-month deadline',
        body_open_questions: 'Auth provider?',
      },
    );
    assert.equal(body_sections.what_building, 'A task tracker');
    assert.equal(body_sections.operational_constraints, '2-month deadline');
    assert.equal(body_sections.open_questions, 'Auth provider?');
  });

  it('returns empty body_sections when LLM has no body fields', () => {
    const { body_sections } = mergeLlmIntoDraft({}, {});
    assert.deepEqual(body_sections, {
      what_building: '',
      operational_constraints: '',
      open_questions: '',
    });
  });

  it('strips LLM boilerplate refusals ("None evident" etc.) to empty', () => {
    const { body_sections } = mergeLlmIntoDraft(
      {},
      {
        body_what_building: 'A real description',
        body_operational_constraints: 'None evident from the repo',
        body_open_questions: 'N/A',
      },
    );
    assert.equal(body_sections.what_building, 'A real description');
    assert.equal(body_sections.operational_constraints, '');
    assert.equal(body_sections.open_questions, '');
  });
});

describe('composeBodyMarkdown', () => {
  it('returns undefined when all sections empty', () => {
    assert.equal(
      composeBodyMarkdown({ what_building: '', operational_constraints: '', open_questions: '' }),
      undefined,
    );
  });

  it('renders all 3 sections when populated', () => {
    const md = composeBodyMarkdown({
      what_building: 'A demo',
      operational_constraints: '2 weeks',
      open_questions: 'TBD',
    });
    assert.ok(md.includes('## What we are building\nA demo'));
    assert.ok(md.includes('## Operational constraints\n2 weeks'));
    assert.ok(md.includes('## Open questions\nTBD'));
  });

  it('falls back to placeholder for missing sections when at least one populated', () => {
    const md = composeBodyMarkdown({
      what_building: 'A demo',
      operational_constraints: '',
      open_questions: '',
    });
    assert.ok(md.includes('A demo'));
    assert.ok(md.includes('[Deadlines'));
    assert.ok(md.includes('[Questions to track'));
  });
});

describe('runProseReviewForExisting (prefilled)', () => {
  it('applies prefilled prose to state', async () => {
    const state = {
      draft: {},
      confidence: {},
      pending_decisions: [],
      body_sections: { what_building: '', operational_constraints: '', open_questions: '' },
    };
    const out = await runProseReviewForExisting(state, {
      prefilledProse: { what_building: 'A demo', open_questions: 'X?' },
    });
    assert.equal(out.body_sections.what_building, 'A demo');
    assert.equal(out.body_sections.open_questions, 'X?');
    assert.equal(out.body_sections.operational_constraints, '');
  });

  it('skips prompts entirely when all sections already populated', async () => {
    const state = {
      draft: {},
      confidence: {},
      pending_decisions: [],
      body_sections: {
        what_building: 'a',
        operational_constraints: 'b',
        open_questions: 'c',
      },
    };
    const out = await runProseReviewForExisting(state);
    assert.deepEqual(out.body_sections, state.body_sections);
  });
});

describe('groupFieldsByConfidence', () => {
  it('partitions into high / lowMedium / declared', () => {
    const out = groupFieldsByConfidence({
      'a.x': 'high',
      'a.y': 'medium',
      'a.z': 'low',
      'a.w': 'declared',
    });
    assert.deepEqual(out.high, ['a.x']);
    assert.deepEqual(out.lowMedium.sort(), ['a.y', 'a.z']);
    assert.deepEqual(out.declared, ['a.w']);
  });

  it('handles empty/null confidence', () => {
    assert.deepEqual(groupFieldsByConfidence(null), { high: [], lowMedium: [], declared: [] });
  });
});

describe('applyReview', () => {
  const baseState = {
    draft: {
      project: { name: 'demo', description: 'a' },
      tier: { selected: 's', rationale: 'r' },
    },
    confidence: {
      'project.name': 'high',
      'project.description': 'medium',
      'tier.selected': 'medium',
    },
    pending_decisions: [],
  };

  it('confirm upgrades confidence to declared', () => {
    const out = applyReview(baseState, [{ field: 'project.name', action: 'confirm' }]);
    assert.equal(out.confidence['project.name'], 'declared');
  });

  it('edit applies value and upgrades confidence to declared', () => {
    const out = applyReview(baseState, [
      { field: 'project.description', action: 'edit', value: 'new desc' },
    ]);
    assert.equal(out.draft.project.description, 'new desc');
    assert.equal(out.confidence['project.description'], 'declared');
  });

  it('skip pushes pending_decision with reason', () => {
    const out = applyReview(baseState, [
      { field: 'tier.selected', action: 'skip', reason: 'undecided' },
    ]);
    assert.equal(out.pending_decisions.length, 1);
    assert.equal(out.pending_decisions[0].field, 'tier.selected');
    assert.equal(out.pending_decisions[0].reason, 'undecided');
  });

  it('does not duplicate pending entries for same field', () => {
    const state = {
      ...baseState,
      pending_decisions: [{ field: 'tier.selected', reason: 'old' }],
    };
    const out = applyReview(state, [{ field: 'tier.selected', action: 'skip', reason: 'new' }]);
    assert.equal(out.pending_decisions.length, 1);
  });

  it('does not mutate input state', () => {
    const snapshot = JSON.stringify(baseState);
    applyReview(baseState, [{ field: 'project.name', action: 'confirm' }]);
    assert.equal(JSON.stringify(baseState), snapshot);
  });
});

describe('runInteractiveReview (with prefilledAnswers)', () => {
  it('processes prefilled answers without inquirer', async () => {
    const state = {
      draft: { project: { name: 'x' } },
      confidence: { 'project.name': 'medium' },
      pending_decisions: [],
    };
    const out = await runInteractiveReview(state, {
      prefilledAnswers: [{ field: 'project.name', action: 'edit', value: 'y' }],
    });
    assert.equal(out.draft.project.name, 'y');
    assert.equal(out.confidence['project.name'], 'declared');
  });
});
