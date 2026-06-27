// Regression guard for NF-4: greenfield CONTEXT_IMPORT must be an idea-based
// discovery workflow, not the raw import-from-repo template.
//
// Before the fix, greenfield scaffold copied common/CONTEXT_IMPORT.md verbatim
// through interpolate(), which does not know [IMPORT_MODE]/[SOURCE_REPOS]/etc —
// leaving raw placeholders and a "read source repositories" Step 1 that makes no
// sense for a project with no source repos. in-place/from-context regenerate it
// correctly via generateContextImport; greenfield never did.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateGreenfieldContextImport } from '../../src/generators/context-import.js';

function genInto(config) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-ctxgf-'));
  return generateGreenfieldContextImport(config, dir).then(() => {
    const content = fs.readFileSync(path.join(dir, 'CONTEXT_IMPORT.md'), 'utf8');
    fs.rmSync(dir, { recursive: true, force: true });
    return content;
  });
}

describe('generateGreenfieldContextImport (NF-4)', () => {
  it('leaves no raw import-from-repo placeholders', async () => {
    const content = await genInto({ projectName: 'Habit Tracker', description: 'A habit tracker' });
    for (const ph of ['[IMPORT_MODE]', '[SOURCE_REPOS]', '[SOURCE_DOCS]', '[PRIMARY_REPO]']) {
      assert.ok(!content.includes(ph), `raw placeholder ${ph} must not survive in greenfield CONTEXT_IMPORT`);
    }
  });

  it('preserves the PENDING_DISCOVERY trigger', async () => {
    const content = await genInto({ projectName: 'X', description: 'Y' });
    assert.match(content, /Status.*PENDING_DISCOVERY/, 'discovery trigger must be preserved');
    assert.match(content, /read this file at the start of every session/i);
  });

  it('drives discovery from the idea, not from source repositories', async () => {
    const content = await genInto({ projectName: 'X', description: 'Y' });
    assert.ok(
      !/Read source repositories/i.test(content),
      'greenfield must not instruct reading source repositories',
    );
    assert.match(content, /greenfield/i, 'must frame the project as greenfield');
  });

  it('interpolates the project name and description', async () => {
    const content = await genInto({
      projectName: 'Habit Tracker',
      description: 'Weekly habit tracker with daily check-ins',
    });
    assert.match(content, /Habit Tracker/);
    assert.match(content, /Weekly habit tracker with daily check-ins/);
  });

  it('falls back gracefully when no description is provided', async () => {
    const content = await genInto({ projectName: 'X' });
    assert.ok(!content.includes('[PROJECT_DESCRIPTION]'), 'description placeholder must be resolved');
    assert.match(content, /infer the idea/i, 'must instruct inferring the idea when none given');
  });
});
