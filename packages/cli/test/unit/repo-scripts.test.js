import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

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
});
