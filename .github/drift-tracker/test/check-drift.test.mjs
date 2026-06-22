import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  loadFeatures,
  stripHtml,
  extractRecentChangelog,
  currentWhatsNewUrl,
  getISOWeek,
  matchFeature,
  extractSnippet,
  formatIssueBody,
} from '../check-drift.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, 'fixtures');

// ── stripHtml ───────────────────────────────────────────────────────────────

describe('stripHtml', () => {
  it('removes script blocks', () => {
    const html = '<p>before</p><script>alert("xss")</script><p>after</p>';
    const text = stripHtml(html);
    assert.ok(!text.includes('alert'));
    assert.ok(text.includes('before'));
    assert.ok(text.includes('after'));
  });

  it('removes style blocks', () => {
    const html = '<style>.red { color: red; }</style><p>content</p>';
    const text = stripHtml(html);
    assert.ok(!text.includes('color'));
    assert.ok(text.includes('content'));
  });

  it('strips all HTML tags', () => {
    const html = '<div class="wrapper"><h1>Title</h1><p>Body <strong>bold</strong></p></div>';
    const text = stripHtml(html);
    assert.ok(!text.includes('<'));
    assert.ok(text.includes('Title'));
    assert.ok(text.includes('bold'));
  });

  it('decodes named entities', () => {
    assert.ok(stripHtml('&amp; &lt; &gt; &quot; &#39;').includes('& < > " \''));
  });

  it('decodes numeric entities', () => {
    assert.ok(stripHtml('&#65;&#66;').includes('AB'));
  });

  it('returns empty string for null/undefined', () => {
    assert.equal(stripHtml(null), '');
    assert.equal(stripHtml(undefined), '');
    assert.equal(stripHtml(''), '');
  });
});

// ── extractRecentChangelog ──────────────────────────────────────────────────

describe('extractRecentChangelog', () => {
  const html = readFileSync(join(FIXTURE_DIR, 'changelog-sample.html'), 'utf8');

  it('parses Update blocks with version, date, and text', () => {
    const entries = extractRecentChangelog(html, 365);
    assert.ok(entries.length >= 3);
    assert.ok(entries.some((e) => e.version === '2.1.105'));
    assert.ok(entries.some((e) => e.version === '2.1.104'));
  });

  it('filters entries older than N days', () => {
    // Fixture has April 11, April 5, March 20, Feb 15 (2026)
    // Reference date pinned to 2026-04-12 — with days=10, only April 5 and April 11 pass
    const entries = extractRecentChangelog(html, 10, new Date('2026-04-12'));
    const versions = entries.map((e) => e.version);
    assert.ok(versions.includes('2.1.105'));
    // March 20 and Feb 15 should be filtered
    assert.ok(!versions.includes('2.1.102'));
  });

  it('returns empty array when no recent entries', () => {
    const entries = extractRecentChangelog(html, 0);
    assert.equal(entries.length, 0);
  });

  it('handles HTML with no Update blocks', () => {
    const entries = extractRecentChangelog('<html><body>No updates here</body></html>', 7);
    assert.equal(entries.length, 0);
  });

  it('strips HTML from entry text', () => {
    const entries = extractRecentChangelog(html, 365);
    const e = entries.find((e) => e.version === '2.1.105');
    assert.ok(e);
    assert.ok(!e.text.includes('<li>'));
    assert.ok(e.text.includes('server-managed settings'));
  });
});

// ── currentWhatsNewUrl / getISOWeek ─────────────────────────────────────────

describe('currentWhatsNewUrl', () => {
  it('returns correct URL format for a known date', () => {
    const url = currentWhatsNewUrl(new Date('2026-04-12'));
    assert.match(url, /\/whats-new\/2026-w\d{2}$/);
  });

  it('pads single-digit week numbers', () => {
    // Jan 5 2026 is week 2
    const url = currentWhatsNewUrl(new Date('2026-01-05'));
    assert.ok(url.endsWith('-w02') || url.endsWith('-w01'));
  });

  it('computes ISO week correctly for a known date', () => {
    // April 12 2026 is a Sunday — ISO week 15
    const week = getISOWeek(new Date('2026-04-12'));
    assert.equal(week, 15);
  });
});

// ── matchFeature ────────────────────────────────────────────────────────────

describe('matchFeature', () => {
  it('matches plain string keyword case-insensitively', () => {
    const feature = { keywords: ['server-managed settings'], keywordMode: 'any' };
    const result = matchFeature(feature, 'New: Added Server-Managed Settings support');
    assert.ok(result.matched);
    assert.equal(result.matchedKeywords.length, 1);
  });

  it('matches regex keyword', () => {
    const feature = { keywords: ['scaffold.*CLAUDE'], keywordMode: 'any' };
    const result = matchFeature(feature, 'We now scaffold a CLAUDE.md file automatically');
    assert.ok(result.matched);
  });

  it('does not match when no keywords hit', () => {
    const feature = { keywords: ['nonexistent-feature-xyz'], keywordMode: 'any' };
    const result = matchFeature(feature, 'This text has nothing relevant');
    assert.ok(!result.matched);
    assert.equal(result.matchedKeywords.length, 0);
  });

  it('mode "any" matches on single keyword', () => {
    const feature = { keywords: ['alpha', 'beta', 'gamma'], keywordMode: 'any' };
    const result = matchFeature(feature, 'Only beta is present here');
    assert.ok(result.matched);
    assert.deepEqual(result.matchedKeywords, ['beta']);
  });

  it('mode "all" requires all keywords', () => {
    const feature = { keywords: ['alpha', 'beta'], keywordMode: 'all' };
    const partial = matchFeature(feature, 'Only alpha is present');
    assert.ok(!partial.matched);

    const full = matchFeature(feature, 'Both alpha and beta are here');
    assert.ok(full.matched);
  });

  it('returns snippets for each matched keyword', () => {
    const feature = { keywords: ['hook template'], keywordMode: 'any' };
    const result = matchFeature(feature, 'Some context before the hook template feature and more after');
    assert.ok(result.matched);
    assert.equal(result.snippets.length, 1);
    assert.ok(result.snippets[0].includes('hook template'));
  });

  it('handles empty text', () => {
    const feature = { keywords: ['test'], keywordMode: 'any' };
    const result = matchFeature(feature, '');
    assert.ok(!result.matched);
  });

  it('handles invalid regex gracefully', () => {
    const feature = { keywords: ['[invalid(regex'], keywordMode: 'any' };
    // Should not throw
    const result = matchFeature(feature, 'some text with [invalid(regex');
    // The keyword contains regex metacharacters so it tries regex, which fails,
    // so it skips. No match.
    assert.equal(result.matchedKeywords.length, 0);
  });
});

// ── extractSnippet ──────────────────────────────────────────────────────────

describe('extractSnippet', () => {
  const text = 'A'.repeat(50) + 'MATCH' + 'B'.repeat(50);

  it('returns window centered on position', () => {
    const snippet = extractSnippet(text, 50, 20);
    assert.ok(snippet.includes('MATCH'));
    assert.ok(snippet.length <= 50); // 20 + 20 + ... prefix/suffix
  });

  it('handles match near start of text', () => {
    const snippet = extractSnippet('MATCH and more text here', 0, 100);
    assert.ok(snippet.startsWith('MATCH'));
    assert.ok(!snippet.startsWith('...'));
  });

  it('handles match near end of text', () => {
    const snippet = extractSnippet('text before MATCH', 12, 100);
    assert.ok(snippet.includes('MATCH'));
    assert.ok(!snippet.endsWith('...'));
  });
});

// ── loadFeatures ────────────────────────────────────────────────────────────

describe('loadFeatures', () => {
  const manifestPath = join(__dirname, '..', 'features.json');

  it('loads the actual features.json', () => {
    const manifest = loadFeatures(manifestPath);
    assert.ok(manifest.features.length >= 10);
  });

  it('every entry has required fields', () => {
    const manifest = loadFeatures(manifestPath);
    for (const f of manifest.features) {
      assert.ok(f.id, `missing id`);
      assert.ok(f.name, `missing name for ${f.id}`);
      assert.ok(['high', 'medium', 'low'].includes(f.risk), `invalid risk for ${f.id}`);
      assert.ok(Array.isArray(f.keywords), `keywords not array for ${f.id}`);
      assert.ok(f.keywords.length > 0, `empty keywords for ${f.id}`);
      assert.ok(Array.isArray(f.tierwardFiles), `tierwardFiles not array for ${f.id}`);
    }
  });

  it('all IDs are unique', () => {
    const manifest = loadFeatures(manifestPath);
    const ids = manifest.features.map((f) => f.id);
    assert.equal(ids.length, new Set(ids).size);
  });
});

// ── formatIssueBody ─────────────────────────────────────────────────────────

describe('formatIssueBody', () => {
  const feature = {
    id: 'test-feature',
    name: 'Test Feature',
    risk: 'high',
    keywords: ['test keyword'],
    tierwardFiles: ['src/test.js'],
    notes: 'Test context note.',
  };
  const matchResult = {
    matchedKeywords: ['test keyword'],
    snippets: ['...surrounding context with test keyword in it...'],
  };
  const scanMeta = {
    scanDate: '2026-04-12',
    changelogUrl: 'https://example.com/changelog',
  };

  it('produces valid markdown with all sections', () => {
    const body = formatIssueBody(matchResult, feature, scanMeta);
    assert.ok(body.includes('## Anthropic Drift Alert: Test Feature'));
    assert.ok(body.includes('**Risk level**: HIGH'));
    assert.ok(body.includes('### What was detected'));
    assert.ok(body.includes('### Tierward files at risk'));
    assert.ok(body.includes('`src/test.js`'));
    assert.ok(body.includes('### Recommended action'));
    assert.ok(body.includes('### Context'));
    assert.ok(body.includes('Test context note.'));
  });

  it('includes keyword table with snippets', () => {
    const body = formatIssueBody(matchResult, feature, scanMeta);
    assert.ok(body.includes('| `test keyword` |'));
    assert.ok(body.includes('surrounding context'));
  });
});
