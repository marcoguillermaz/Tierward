// Small consistency checks on shipped text and settings (DEC-56 C): each one
// pins a statement that used to disagree with what the files actually do.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO = path.join(PACKAGE_ROOT, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(...parts), 'utf8');

describe('shipped text matches what the files do', () => {
  // `claude plugin validate .` advises this line (Claude Code 2.1.296)
  it('the README shows the one-step plugin install', () => {
    assert.match(
      read(REPO, 'README.md'),
      /\/plugin install tierward --marketplace marcoguillermaz\/Tierward/,
    );
  });

  // The tier settings set both values; nothing suppresses the trailer
  it('files-guide describes the attribution the settings really set', () => {
    const guide = read(PACKAGE_ROOT, 'templates', 'common', 'files-guide.md');
    assert.doesNotMatch(guide, /attribution\.commit\/pr: ""/);
    const { attribution } = JSON.parse(
      read(PACKAGE_ROOT, 'templates', 'tier-m', '.claude', 'settings.json'),
    );
    assert.ok(guide.includes(attribution.commit), 'commit trailer named in the guide');
  });

  // In a Markdown table `\|` stands for `|`; with `grep -E` the unescaped
  // command is right in every row (C12 and C16 used grep's basic `\|`).
  it('arch-audit batch commands read the same once the table escapes are removed', () => {
    const copies = [
      ...['s', 'm', 'l'].map((t) =>
        path.join(PACKAGE_ROOT, 'templates', `tier-${t}`, '.claude', 'skills', 'arch-audit'),
      ),
      path.join(REPO, 'plugin', 'skills', 'arch-audit'),
    ];
    for (const dir of copies) {
      const rows = read(dir, 'BATCH_COMMANDS.md').split('\n');
      const row = (id) => rows.find((line) => line.startsWith(`| ${id} `));
      assert.match(row('C12'), /grep -o -E "/, dir);
      assert.match(row('C16'), /grep -rn -E /, dir);
    }
  });

  // The hook creates ~/.claude/audit user-only (0700); an inline mkdir did not
  it('Tier M logs the session start through the audit hook, like Tier L', () => {
    const settings = JSON.parse(
      read(PACKAGE_ROOT, 'templates', 'tier-m', '.claude', 'settings.json'),
    );
    const commands = settings.hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command));
    assert.ok(commands.includes('node "$CLAUDE_PROJECT_DIR/.claude/hooks/tierward-audit-log.mjs"'));
    assert.ok(!commands.some((c) => c.includes('mkdir -p ~/.claude/audit')), commands.join('\n'));
  });
});
