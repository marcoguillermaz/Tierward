import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../../../..');

// `git check-ignore` exits 0 when the path is ignored and 1 when it is not.
// --no-index tests the rules, so the files need not exist.
function ignored(rel) {
  const res = spawnSync('git', ['check-ignore', '-q', '--no-index', rel], { cwd: REPO });
  if (res.status !== 0 && res.status !== 1) {
    throw new Error(`git check-ignore failed for ${rel}: ${res.stderr}`);
  }
  return res.status === 0;
}

describe('repository .gitignore', () => {
  // The root rules for local context files match at any depth; a new template
  // with one of these names would be skipped by `git add` and miss the release.
  for (const name of ['CLAUDE.md', 'MEMORY.md', 'CONTEXT_IMPORT.md', 'FIRST_SESSION.md']) {
    it(`does not ignore a template named ${name}`, () => {
      for (const dir of ['common', 'tier-0', 'tier-s', 'tier-m', 'tier-l']) {
        const rel = `packages/cli/templates/${dir}/${name}`;
        assert.equal(ignored(rel), false, rel);
      }
    });
  }

  it('still ignores the maintainer context files at the root', () => {
    for (const rel of ['CLAUDE.md', 'MEMORY.md', 'CONTEXT_IMPORT.md', 'FIRST_SESSION.md']) {
      assert.equal(ignored(rel), true, rel);
    }
  });
});
