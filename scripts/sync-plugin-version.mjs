/**
 * sync-plugin-version.mjs
 *
 * Keeps .claude-plugin/plugin.json, marketplace.json, and server.json in
 * lockstep with packages/cli/package.json. Run this as part of every CLI
 * release:
 *
 *   node scripts/sync-plugin-version.mjs
 *
 * It is also wired as the `postversion` script in packages/cli/package.json,
 * so `npm version <bump>` in that directory runs it automatically after
 * bumping. The unit test packages/cli/test/unit/plugin-version-sync.test.js
 * enforces that the versions are equal — so CI catches any drift that slips
 * through.
 *
 * What it updates:
 *   .claude-plugin/plugin.json   → version field
 *   marketplace.json             → plugins[0].source.sha (current HEAD of main)
 *   server.json                  → version + packages[0].version fields
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const pkgPath = resolve(root, 'packages/cli/package.json');
const pluginPath = resolve(root, '.claude-plugin/plugin.json');
const marketplacePath = resolve(root, 'marketplace.json');
const serverPath = resolve(root, 'server.json');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const plugin = JSON.parse(readFileSync(pluginPath, 'utf8'));
const marketplace = JSON.parse(readFileSync(marketplacePath, 'utf8'));
const server = JSON.parse(readFileSync(serverPath, 'utf8'));

const version = pkg.version;
let changed = false;

if (plugin.version !== version) {
  plugin.version = version;
  writeFileSync(pluginPath, JSON.stringify(plugin, null, 2) + '\n');
  console.log(`✓ .claude-plugin/plugin.json → ${version}`);
  changed = true;
} else {
  console.log(`  .claude-plugin/plugin.json already at ${version}`);
}

let sha;
try {
  sha = execSync('git rev-parse origin/main', { encoding: 'utf8' }).trim();
} catch {
  try {
    sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    sha = null;
  }
}

if (sha && marketplace.plugins?.[0]?.source) {
  const prev = marketplace.plugins[0].source.sha;
  if (prev !== sha) {
    marketplace.plugins[0].source.sha = sha;
    writeFileSync(marketplacePath, JSON.stringify(marketplace, null, 2) + '\n');
    console.log(`✓ marketplace.json sha → ${sha.slice(0, 12)}...`);
    changed = true;
  } else {
    console.log(`  marketplace.json sha already current`);
  }
}

let serverChanged = false;
if (server.version !== version) {
  server.version = version;
  serverChanged = true;
}
if (server.packages?.[0]?.version !== version) {
  server.packages[0].version = version;
  serverChanged = true;
}
if (serverChanged) {
  writeFileSync(serverPath, JSON.stringify(server, null, 2) + '\n');
  console.log(`✓ server.json → ${version}`);
  changed = true;
} else {
  console.log(`  server.json already at ${version}`);
}

if (!changed) {
  console.log('  nothing to update — already in sync');
}
