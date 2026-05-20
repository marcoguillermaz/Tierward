import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  GREENFIELD_CRITERIA,
  EXISTING_CRITERIA,
  CRITERION_LABELS,
  parseArgs,
  detectMode,
  pickCriteriaForMode,
  renderCriteriaList,
  fillTemplate,
  parseScores,
  median,
  aggregate,
  renderMarkdownReport,
} from '../../../../scripts/cross-llm-rubric.mjs';

// ── parseArgs ─────────────────────────────────────────────────────────────

describe('parseArgs', () => {
  it('parses --context and --out', () => {
    const a = parseArgs(['node', 'rubric.mjs', '--context', 'CONTEXT.md', '--out', 'out/']);
    assert.equal(a.context, 'CONTEXT.md');
    assert.equal(a.out, 'out/');
  });

  it('throws on missing --context', () => {
    assert.throws(
      () => parseArgs(['node', 'rubric.mjs', '--out', 'out/']),
      /missing required --context/,
    );
  });

  it('throws on missing --out', () => {
    assert.throws(
      () => parseArgs(['node', 'rubric.mjs', '--context', 'CONTEXT.md']),
      /missing required --out/,
    );
  });

  it('captures optional --repo-summary', () => {
    const a = parseArgs([
      'node',
      'rubric.mjs',
      '--context',
      'CONTEXT.md',
      '--out',
      'out/',
      '--repo-summary',
      'summary.txt',
    ]);
    assert.equal(a['repo-summary'], 'summary.txt');
  });
});

// ── detectMode ────────────────────────────────────────────────────────────

describe('detectMode', () => {
  it('extracts mode from valid frontmatter', () => {
    const md = `---\nproject:\n  name: foo\n  mode: in-place\n---\nbody`;
    assert.equal(detectMode(md), 'in-place');
  });

  it('handles quoted mode value', () => {
    const md = `---\n  mode: 'greenfield'\n---\nbody`;
    assert.equal(detectMode(md), 'greenfield');
  });

  it('throws when frontmatter is missing', () => {
    assert.throws(() => detectMode('no frontmatter here'), /missing YAML frontmatter/);
  });

  it('throws when mode field is missing', () => {
    const md = `---\nname: foo\n---\nbody`;
    assert.throws(() => detectMode(md), /missing project\.mode/);
  });
});

// ── pickCriteriaForMode ───────────────────────────────────────────────────

describe('pickCriteriaForMode', () => {
  it('returns 3 criteria for greenfield', () => {
    assert.deepEqual(pickCriteriaForMode('greenfield'), GREENFIELD_CRITERIA);
    assert.equal(pickCriteriaForMode('greenfield').length, 3);
  });

  it('returns 12 criteria for in-place', () => {
    assert.deepEqual(pickCriteriaForMode('in-place'), EXISTING_CRITERIA);
    assert.equal(pickCriteriaForMode('in-place').length, 12);
  });

  it('returns 12 criteria for from-context', () => {
    assert.equal(pickCriteriaForMode('from-context').length, 12);
  });

  it('throws on unknown mode', () => {
    assert.throws(() => pickCriteriaForMode('weird-mode'), /unknown project\.mode/);
  });
});

// ── renderCriteriaList ────────────────────────────────────────────────────

describe('renderCriteriaList', () => {
  it('formats criteria with labels', () => {
    const out = renderCriteriaList(['A1', 'Q1']);
    assert.ok(out.includes(`A1: ${CRITERION_LABELS.A1}`));
    assert.ok(out.includes(`Q1: ${CRITERION_LABELS.Q1}`));
  });

  it('emits one line per criterion', () => {
    const out = renderCriteriaList(['A1', 'A2', 'A3']);
    assert.equal(out.split('\n').length, 3);
  });
});

// ── fillTemplate ──────────────────────────────────────────────────────────

describe('fillTemplate', () => {
  it('replaces all placeholders', () => {
    const tpl = '{MODE} / {REPO_SUMMARY} / {CONTEXT_MD_CONTENT} / {CRITERIA_LIST}';
    const out = fillTemplate({
      template: tpl,
      mode: 'in-place',
      repoSummary: 'SUMMARY',
      contextMd: 'CTX',
      criteria: ['Q1'],
    });
    assert.ok(out.includes('in-place'));
    assert.ok(out.includes('SUMMARY'));
    assert.ok(out.includes('CTX'));
    assert.ok(out.includes('Q1'));
  });

  it('falls back to placeholder text when repoSummary is empty', () => {
    const tpl = '{REPO_SUMMARY}';
    const out = fillTemplate({
      template: tpl,
      mode: 'greenfield',
      repoSummary: '',
      contextMd: '',
      criteria: [],
    });
    assert.match(out, /greenfield/);
  });
});

// ── parseScores ───────────────────────────────────────────────────────────

describe('parseScores', () => {
  const expected = ['Q1', 'Q2', 'Q3'];

  it('parses raw JSON with scores wrapper', () => {
    const raw = JSON.stringify({
      scores: { Q1: { score: 3, comment: 'ok' }, Q2: { score: 2 }, Q3: { score: 1 } },
    });
    const out = parseScores(raw, expected);
    assert.equal(out.Q1.score, 3);
    assert.equal(out.Q1.comment, 'ok');
    assert.equal(out.Q2.score, 2);
    assert.equal(out.Q3.score, 1);
  });

  it('parses JSON inside ```json fence', () => {
    const raw =
      'Here is my scoring:\n```json\n{"scores":{"Q1":{"score":2},"Q2":{"score":3},"Q3":{"score":2}}}\n```\nDone.';
    const out = parseScores(raw, expected);
    assert.equal(out.Q1.score, 2);
    assert.equal(out.Q2.score, 3);
  });

  it('parses JSON with leading prose via greedy extraction', () => {
    const raw = 'Sure, here is my score.\n{"Q1":{"score":2},"Q2":{"score":2},"Q3":{"score":3}}\n';
    const out = parseScores(raw, expected);
    assert.equal(out.Q1.score, 2);
    assert.equal(out.Q3.score, 3);
  });

  it('returns null on completely malformed input', () => {
    assert.equal(parseScores('no json here at all', expected), null);
    assert.equal(parseScores('', expected), null);
    assert.equal(parseScores(null, expected), null);
  });

  it('rejects scores outside [0,3]', () => {
    const raw = JSON.stringify({
      scores: { Q1: { score: 5 }, Q2: { score: 2 }, Q3: { score: 3 } },
    });
    const out = parseScores(raw, expected);
    assert.equal(out.Q1, undefined);
    assert.equal(out.Q2.score, 2);
  });

  it('accepts plain numeric values (no wrapper object)', () => {
    const raw = JSON.stringify({ scores: { Q1: 3, Q2: 2, Q3: 1 } });
    const out = parseScores(raw, expected);
    assert.equal(out.Q1.score, 3);
    assert.equal(out.Q2.score, 2);
    assert.equal(out.Q3.score, 1);
  });
});

// ── median ────────────────────────────────────────────────────────────────

describe('median', () => {
  it('returns 0 on empty array', () => {
    assert.equal(median([]), 0);
  });

  it('returns the middle value on odd-length arrays', () => {
    assert.equal(median([1, 2, 3]), 2);
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([1, 1, 1]), 1);
  });

  it('returns the average of middle values on even-length arrays', () => {
    assert.equal(median([1, 3]), 2);
    assert.equal(median([2, 3]), 2.5);
  });
});

// ── aggregate ─────────────────────────────────────────────────────────────

describe('aggregate', () => {
  const allHigh = [
    { name: 'opus', scores: { Q1: { score: 3 }, Q2: { score: 3 }, Q3: { score: 3 } } },
    { name: 'sonnet', scores: { Q1: { score: 3 }, Q2: { score: 3 }, Q3: { score: 3 } } },
    { name: 'gemini', scores: { Q1: { score: 3 }, Q2: { score: 3 }, Q3: { score: 3 } } },
  ];

  it('computes median per criterion and overall PASS when all >= 2', () => {
    const out = aggregate({ criteria: ['Q1', 'Q2', 'Q3'], providerResults: allHigh });
    assert.equal(out.status, 'PASS');
    assert.equal(out.perCriterion.Q1.median, 3);
    assert.equal(out.summary.all_above_two, true);
    assert.equal(out.summary.percent_above_two, 100);
  });

  it('marks FAIL when one median drops below 2', () => {
    const results = [
      { name: 'opus', scores: { Q1: { score: 1 }, Q2: { score: 3 }, Q3: { score: 3 } } },
      { name: 'sonnet', scores: { Q1: { score: 1 }, Q2: { score: 3 }, Q3: { score: 3 } } },
      { name: 'gemini', scores: { Q1: { score: 2 }, Q2: { score: 3 }, Q3: { score: 3 } } },
    ];
    const out = aggregate({ criteria: ['Q1', 'Q2', 'Q3'], providerResults: results });
    assert.equal(out.status, 'FAIL');
    assert.equal(out.perCriterion.Q1.median, 1);
    assert.equal(out.summary.all_above_two, false);
  });

  it('treats missing scores from a provider as 0', () => {
    const results = [
      { name: 'opus', scores: { Q1: { score: 3 }, Q2: { score: 3 }, Q3: { score: 3 } } },
      { name: 'sonnet', scores: {} },
      { name: 'gemini', scores: { Q1: { score: 3 }, Q2: { score: 3 }, Q3: { score: 3 } } },
    ];
    const out = aggregate({ criteria: ['Q1', 'Q2', 'Q3'], providerResults: results });
    assert.equal(out.perCriterion.Q1.scores.sonnet, 0);
    assert.equal(out.perCriterion.Q1.median, 3);
  });

  it('records per-provider scores in the per-criterion entry', () => {
    const out = aggregate({ criteria: ['Q1'], providerResults: allHigh });
    assert.deepEqual(out.perCriterion.Q1.scores, { opus: 3, sonnet: 3, gemini: 3 });
  });
});

// ── renderMarkdownReport ─────────────────────────────────────────────────

describe('renderMarkdownReport', () => {
  it('produces markdown including status, table and provider models', () => {
    const aggregation = aggregate({
      criteria: ['Q1', 'Q2', 'Q3'],
      providerResults: [
        { name: 'opus', scores: { Q1: { score: 3 }, Q2: { score: 2 }, Q3: { score: 3 } } },
        { name: 'sonnet', scores: { Q1: { score: 3 }, Q2: { score: 3 }, Q3: { score: 3 } } },
        { name: 'gemini', scores: { Q1: { score: 2 }, Q2: { score: 2 }, Q3: { score: 3 } } },
      ],
    });
    const providerResults = [
      { name: 'opus', model: 'claude-opus-4-7', malformed: false },
      { name: 'sonnet', model: 'claude-sonnet-4-6', malformed: false },
      { name: 'gemini', model: 'gemini-2.5-pro', malformed: false },
    ];
    const md = renderMarkdownReport({
      aggregation,
      providerResults,
      meta: {
        generatedAt: '2026-05-20T00:00:00Z',
        contextPath: '/tmp/CONTEXT.md',
        mode: 'greenfield',
      },
    });
    assert.match(md, /PASS/);
    assert.match(md, /\| Criterion \|/);
    assert.match(md, /claude-opus-4-7/);
    assert.match(md, /claude-sonnet-4-6/);
    assert.match(md, /gemini-2\.5-pro/);
  });

  it('flags malformed providers in the markdown', () => {
    const aggregation = aggregate({
      criteria: ['Q1'],
      providerResults: [
        { name: 'opus', scores: { Q1: { score: 3 } } },
        { name: 'sonnet', scores: {} },
        { name: 'gemini', scores: { Q1: { score: 2 } } },
      ],
    });
    const providerResults = [
      { name: 'opus', model: 'claude-opus-4-7', malformed: false },
      { name: 'sonnet', model: 'claude-sonnet-4-6', malformed: true },
      { name: 'gemini', model: 'gemini-2.5-pro', malformed: false },
    ];
    const md = renderMarkdownReport({
      aggregation,
      providerResults,
      meta: {
        generatedAt: '2026-05-20T00:00:00Z',
        contextPath: '/tmp/CONTEXT.md',
        mode: 'greenfield',
      },
    });
    assert.match(md, /malformed JSON response from: sonnet/);
  });
});
