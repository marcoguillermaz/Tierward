import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  expectedHeaders,
  pageHeader,
  splitPage,
  tableCell,
} from '../../../../scripts/gen-skill-registry.mjs';

// Maintainer scripts tracked in scripts/ (DEC-60 j/k/l): each one is either
// run by CI or documented for the maintainer; one-shot scripts are removed.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../../../..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

describe('maintainer scripts', () => {
  it('CI runs the template linter in the required lint job', () => {
    const ci = read('.github/workflows/ci.yml');
    const lintJob = ci.slice(ci.indexOf('\n  lint:'), ci.indexOf('\n  audit:'));
    assert.match(lintJob, /run: node scripts\/lint-templates\.mjs/);
  });

  it('CONTRIBUTING documents the skill page generator', () => {
    assert.match(read('CONTRIBUTING.md'), /scripts\/gen-skill-registry\.mjs/);
  });

  it('the one-shot page filler is gone, with its .gitignore exception', () => {
    assert.ok(!fs.existsSync(path.join(REPO, 'scripts/fill-skill-content.mjs')));
    assert.doesNotMatch(read('.gitignore'), /fill-skill-content/);
  });

  // The docs site is English; the generator used to emit Italian section
  // headings, and every page it created kept them (DEC-67).
  it('the skill page generator and the skill pages use English section headings', () => {
    const italian = /Dove e quando|Output atteso/;
    const sections = /^## When to use$[\s\S]*^## Expected output$/m;

    const generator = read('scripts/gen-skill-registry.mjs');
    assert.doesNotMatch(generator, italian);
    assert.match(generator, sections);

    const pages = fs
      .readdirSync(path.join(REPO, 'site/skills'))
      .filter((f) => f.endsWith('.md') && f !== 'index.md');
    assert.ok(pages.length > 0, 'no skill pages found');
    for (const page of pages) {
      const text = read(`site/skills/${page}`);
      assert.doesNotMatch(text, italian, `${page} has an Italian heading`);
      assert.match(text, sections, `${page} lacks the English section headings`);
    }
  });

  // The header of every skill page (title, description, tiers, model, flags)
  // is what the generator writes from the templates' SKILL.md: a page that
  // drifts from its skill is refreshed with --refresh-headers (I6).
  it('every skill page carries the header the generator writes from SKILL.md', () => {
    const headers = expectedHeaders();
    assert.ok(Object.keys(headers).length > 20, 'skills found in the templates');
    const drifted = [];
    for (const [file, header] of Object.entries(headers)) {
      const page = splitPage(read(`site/skills/${file}`));
      if (!page || page.header !== header) drifted.push(file);
    }
    assert.deepEqual(
      drifted,
      [],
      'header drift: run `node scripts/gen-skill-registry.mjs --refresh-headers`',
    );
  });

  // A `|` inside the Flags code span used to split the GFM table cell, so the
  // live page showed the flags up to the first pipe (I5).
  it('escapes a pipe in the Flags cell so the table keeps its 3 cells', () => {
    assert.equal(tableCell('[static|full] [target:<path>]'), '[static\\|full] [target:<path>]');
    // A backslash is escaped too, so one in the source cannot absorb the escape
    // added before a pipe (no shipped argument-hint carries one today).
    assert.equal(tableCell('a\\b|c'), 'a\\\\b\\|c');
    const entries = [{ tier: 'm', fm: { name: 'x', description: 'd', 'argument-hint': '[a|b]' } }];
    const row = pageHeader('x', entries).trim().split('\n').pop();
    assert.ok(row.includes('`[a\\|b]`'), row);
    assert.equal(row.split(/(?<!\\)\|/).length - 2, 3, `3 cells expected in: ${row}`);
  });
});
