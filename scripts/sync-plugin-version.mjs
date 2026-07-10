/**
 * sync-plugin-version.mjs
 *
 * Keeps .claude-plugin/plugin.json, marketplace.json, and server.json in
 * lockstep with packages/cli/package.json. Two modes:
 *
 *   node scripts/sync-plugin-version.mjs
 *     Version sync only: .claude-plugin/plugin.json → version,
 *     server.json → version + packages[0].version. Wired as the
 *     `postversion` script in packages/cli/package.json, so
 *     `npm version <bump>` in that directory runs it automatically.
 *
 *   node scripts/sync-plugin-version.mjs --sha
 *     Sha sync only: marketplace.json → plugins[0].source.sha, resolved
 *     from origin/main after a fetch. This MUST run after the release
 *     promotion has merged into main — at `npm version` time main does not
 *     contain the release yet, so a sha resolved then always points one
 *     release behind (the 2.0.0 lag fixed by PR #404). The post-merge
 *     follow-up is codified in scripts/release-sha-followup.sh.
 *
 * The unit test packages/cli/test/unit/plugin-version-sync.test.js enforces
 * that the versions are equal — so CI catches any drift that slips through.
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

const shaMode = process.argv.includes('--sha');

if (shaMode) {
  const marketplace = JSON.parse(readFileSync(marketplacePath, 'utf8'));
  execSync('git fetch origin main', { stdio: 'inherit' });
  const sha = execSync('git rev-parse origin/main', { encoding: 'utf8' }).trim();
  if (!marketplace.plugins?.[0]?.source) {
    console.error('marketplace.json has no plugins[0].source — aborting');
    process.exit(1);
  }
  const prev = marketplace.plugins[0].source.sha;
  if (prev === sha) {
    console.log(`  marketplace.json sha already at ${sha.slice(0, 12)}...`);
  } else {
    marketplace.plugins[0].source.sha = sha;
    writeFileSync(marketplacePath, JSON.stringify(marketplace, null, 2) + '\n');
    console.log(`✓ marketplace.json sha → ${sha.slice(0, 12)}...`);
  }
  process.exit(0);
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const plugin = JSON.parse(readFileSync(pluginPath, 'utf8'));
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
