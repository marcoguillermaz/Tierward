// Regression suite for the AI commit audit hook in the scaffolded
// `.pre-commit-config.yaml` (templates/common/pre-commit-config.yaml).
//
// The hook runs at the commit-msg stage, where pre-commit passes the commit message
// file as the last argument. These tests run the template's `entry` the same way
// (entry tokens + message file) against temp message files, so they need bash but
// not the pre-commit binary.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.resolve(__dirname, '../../templates/common/pre-commit-config.yaml');
const WARNING = 'AI-assisted commit detected';

function aiReviewHook() {
  const config = load(fs.readFileSync(TEMPLATE, 'utf8'));
  return config.repos
    .flatMap((r) => r.hooks || [])
    .find((h) => h.id === 'ai-commit-review-reminder');
}

// pre-commit splits `entry` with shlex and appends the message file; `sh -c`
// applies the same quoting rules to the entry string. execFileSync throws on a
// non-zero exit, so every passing run also asserts the hook never blocks a commit.
function runHook(message) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-precommit-'));
  const msgFile = path.join(dir, 'COMMIT_EDITMSG');
  fs.writeFileSync(msgFile, message);
  try {
    return execFileSync('sh', ['-c', `${aiReviewHook().entry} "$1"`, 'sh', msgFile], {
      cwd: dir,
      encoding: 'utf8',
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('pre-commit config template', () => {
  it('parses and installs both the pre-commit and commit-msg hook types', () => {
    const config = load(fs.readFileSync(TEMPLATE, 'utf8'));
    assert.ok(config.default_install_hook_types.includes('pre-commit'));
    assert.ok(config.default_install_hook_types.includes('commit-msg'));
  });
});

describe(
  'ai-commit-review-reminder hook (commit-msg)',
  { skip: process.platform === 'win32' && 'needs sh and bash' },
  () => {
    it('warns on the trailer Tierward writes', () => {
      const out = runHook('feat: add x\n\nCo-authored-by: Claude <noreply@anthropic.com>\n');
      assert.match(out, new RegExp(WARNING));
    });

    it("warns on Claude Code's default trailer casing", () => {
      const out = runHook('feat: add x\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n');
      assert.match(out, new RegExp(WARNING));
    });

    it('stays silent without the trailer', () => {
      const out = runHook('fix: correct y\n\nPlain human commit.\n');
      assert.doesNotMatch(out, new RegExp(WARNING));
    });

    it('stays silent when the phrase is not at the start of a line', () => {
      const out = runHook('docs: explain the Co-authored-by: Claude trailer\n');
      assert.doesNotMatch(out, new RegExp(WARNING));
    });
  },
);
