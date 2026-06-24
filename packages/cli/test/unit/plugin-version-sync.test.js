import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'node:url';

// Release guard: all versioned manifests must stay in lockstep with the CLI
// package. They drifted in the past when releases bumped packages/cli/package.json
// but not the plugin/server manifests. This test runs in the required CI checks,
// so a mismatch BLOCKS the merge. The postversion script (sync-plugin-version.mjs)
// syncs all three automatically; drift means the script was bypassed.
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
        `packages/cli/package.json version (${pkg.version}). Run ` +
        `scripts/sync-plugin-version.mjs to fix.`,
    );
  });

  it('server.json version equals packages/cli/package.json version', () => {
    const pkg = fs.readJsonSync(path.join(repoRoot, 'packages/cli/package.json'));
    const server = fs.readJsonSync(path.join(repoRoot, 'server.json'));
    assert.equal(
      server.version,
      pkg.version,
      `server.json version (${server.version}) must equal ` +
        `packages/cli/package.json version (${pkg.version}). Run ` +
        `scripts/sync-plugin-version.mjs to fix.`,
    );
  });

  it('server.json packages[0].version equals packages/cli/package.json version', () => {
    const pkg = fs.readJsonSync(path.join(repoRoot, 'packages/cli/package.json'));
    const server = fs.readJsonSync(path.join(repoRoot, 'server.json'));
    assert.equal(
      server.packages?.[0]?.version,
      pkg.version,
      `server.json packages[0].version (${server.packages?.[0]?.version}) must equal ` +
        `packages/cli/package.json version (${pkg.version}). Run ` +
        `scripts/sync-plugin-version.mjs to fix.`,
    );
  });
});
