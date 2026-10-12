import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'node:url';

// The plugin's skills are hand-copied from the scaffold templates, and nothing
// kept them in sync: by 2026-10 four files had lost content the templates gained
// (DEC-59 h). Every plugin file that has a template counterpart must equal one
// of the tier copies, after the plugin's documented variations are applied.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');
const PLUGIN_SKILLS = path.join(repoRoot, 'plugin/skills');
const TEMPLATES = path.join(repoRoot, 'packages/cli/templates');

// [template text, plugin text]: the only differences the plugin may carry.
const PLUGIN_VARIATIONS = {
  // A plugin user's project may have no .claude/session/ (no Tierward scaffold).
  'arch-audit/SKILL.md': [
    [
      '## Step 5 - Update timestamp\n\n```bash\ndate +%s > "$CLAUDE_PROJECT_DIR/.claude/session/last-arch-audit"\n```',
      '## Step 5 - Update timestamp\n\nOnly run if the directory already exists (Tierward-scaffolded projects):\n\n```bash\n[ -d "$CLAUDE_PROJECT_DIR/.claude/session" ] && date +%s > "$CLAUDE_PROJECT_DIR/.claude/session/last-arch-audit"\n```',
    ],
  ],
};

function pluginFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? pluginFiles(p, base) : [path.relative(base, p)];
  });
}

function templateCopies(rel) {
  return ['s', 'm', 'l']
    .map((t) => path.join(TEMPLATES, `tier-${t}`, '.claude/skills', rel))
    .filter((p) => fs.existsSync(p));
}

describe('plugin skills match the scaffold templates', () => {
  for (const rel of pluginFiles(PLUGIN_SKILLS)) {
    const copies = templateCopies(rel);
    if (copies.length === 0) continue; // plugin-only skill (humanize)
    it(`plugin/skills/${rel}`, () => {
      const plugin = fs.readFileSync(path.join(PLUGIN_SKILLS, rel), 'utf8');
      const expected = copies.map((p) => {
        let text = fs.readFileSync(p, 'utf8');
        for (const [from, to] of PLUGIN_VARIATIONS[rel] || []) {
          assert.ok(text.includes(from), `${p} no longer contains the varied text`);
          text = text.replace(from, to);
        }
        return text;
      });
      assert.ok(
        expected.includes(plugin),
        `plugin/skills/${rel} differs from every template copy (${copies
          .map((p) => path.relative(TEMPLATES, p))
          .join(', ')}); copy the template and keep only the variations listed in this test`,
      );
    });
  }
});
