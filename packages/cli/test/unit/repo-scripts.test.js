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
});
