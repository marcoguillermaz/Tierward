// In-place init keeps the project's own .gitignore (existing files are skipped)
// and appends only the entries in IN_PLACE_GITIGNORE_ENTRIES. Every path the
// scaffold's hooks and skills write logs or temp files to must be in that list, or an
// existing project starts showing those files as untracked: the instructions log
// (.claude/logs/) and the pr-review / dependency-audit temp files (.tierward/tmp/),
// which hold full PR diffs and test output.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IN_PLACE_GITIGNORE_ENTRIES } from '../../src/commands/init-in-place.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_GITIGNORE = path.resolve(__dirname, '../../templates/common/gitignore');

describe('in-place init .gitignore entries', () => {
  // .claude/worktrees/: Tier L creates block worktrees there (DEC-56 C).
  // .claude/settings.json.bak.*: the backup init writes next to an existing
  // settings.json holds the user's pre-merge permissions (DEC-80, F10).
  for (const entry of [
    '.claude/session/',
    '.claude/logs/',
    '.tierward/tmp/',
    '.claude/worktrees/',
    '.claude/settings.json.bak.*',
  ]) {
    it(`appends ${entry} to an existing .gitignore`, () => {
      assert.ok(IN_PLACE_GITIGNORE_ENTRIES.includes(entry), `${entry} missing`);
    });
    it(`ships ${entry} in the greenfield .gitignore template`, () => {
      const lines = fs.readFileSync(TEMPLATE_GITIGNORE, 'utf8').split('\n');
      assert.ok(lines.includes(entry), `${entry} missing from templates/common/gitignore`);
    });
  }
});
