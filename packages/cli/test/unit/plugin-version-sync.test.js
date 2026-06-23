import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'node:url';

// Release guard: the Claude Code marketplace plugin version must stay in lockstep
// with the published CLI package. They drifted once (plugin.json 1.33.1 vs
// package 1.33.3) because releases bump packages/cli/package.json but not
// .claude-plugin/plugin.json. This test runs in the required CI checks, so a
// mismatch BLOCKS the merge — a hard stop, not a reminder. On release, bump
// .claude-plugin/plugin.json to match and re-publish the marketplace plugin.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');

describe('marketplace plugin / CLI package version sync', () => {
  it('.claude-plugin/plugin.json version equals packages/cli/package.json version', () => {
    const pkg = fs.readJsonSync(path.join(repoRoot, 'packages/cli/package.json'));
    const plugin = fs.readJsonSync(path.join(repoRoot, '.claude-plugin/plugin.json'));
    assert.equal(
      plugin.version,
      pkg.version,
      `.claude-plugin/plugin.json version (${plugin.version}) must equal ` +
        `packages/cli/package.json version (${pkg.version}). Bump plugin.json and ` +
        `re-publish the Claude Code marketplace plugin on release.`,
    );
  });
});
