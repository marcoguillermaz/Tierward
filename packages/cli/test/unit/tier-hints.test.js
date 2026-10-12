import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '../../src/index.js');
const TEAM_SETTINGS_CLI = pathToFileURL(
  path.resolve(__dirname, '../../src/utils/team-settings-cli.js'),
).href;

let TMP;

before(async () => {
  TMP = await fs.mkdtemp(path.join(os.tmpdir(), 'tier-hints-test-'));
});

after(async () => {
  await fs.remove(TMP);
});

// Tier S scaffold whose team-settings.json requires tier M.
async function tierSProjectRequiringM(name) {
  const dir = path.join(TMP, name);
  await fs.ensureDir(path.join(dir, '.claude/rules'));
  await fs.writeFile(path.join(dir, '.claude/settings.json'), '{}\n');
  await fs.writeFile(path.join(dir, '.claude/rules/pipeline.md'), '# Fast Lane Pipeline\n');
  await fs.writeJson(path.join(dir, '.claude/team-settings.json'), { minTier: 'm' });
  return dir;
}

// The documented tier switch ("Changing tier"): a new branch, `init` in
// "New project" mode with the new tier, then a review of the diff. In-place
// init ("Existing project") skips existing files and keeps the old pipeline.
function assertDocumentedTierSwitch(text) {
  assert.match(text, /requires minTier=m/);
  assert.match(text, /init --tier=m/);
  assert.match(text, /"New project"/);
  assert.match(text, /branch/);
  assert.match(text, /guide\/tiers\.html#changing-tier/);
  assert.doesNotMatch(text, /Existing project/);
}

describe('tier-change hints', () => {
  it('upgrade on a scaffold below minTier points to the documented tier switch', async () => {
    const dir = await tierSProjectRequiringM('upgrade');
    const res = spawnSync('node', [CLI, 'upgrade', '--dry-run'], { cwd: dir, encoding: 'utf8' });
    assert.equal(res.status, 1);
    assertDocumentedTierSwitch(res.stderr);
    assert.match(res.stderr, /edit \.claude\/team-settings\.json/);
  });

  // init calls it while the user is choosing a tier, so it asks for a higher one
  it('enforceTeamSettingsTier asks for a tier that meets minTier', async () => {
    const dir = await tierSProjectRequiringM('enforce');
    const script = `import { enforceTeamSettingsTier } from ${JSON.stringify(TEAM_SETTINGS_CLI)};
enforceTeamSettingsTier(process.cwd(), 's');`;
    const res = spawnSync('node', ['--input-type=module', '-e', script], {
      cwd: dir,
      encoding: 'utf8',
    });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /requires minTier=m, current tier is s/);
    assert.match(res.stderr, /Choose tier m or higher, or edit \.claude\/team-settings\.json/);
  });

  // DEC-56 B: every other place that tells the user how to change tier
  it('the Tier 0 next steps point to the documented tier switch', async () => {
    const dir = path.join(TMP, 'tier-0');
    await fs.ensureDir(dir);
    const answers = JSON.stringify({
      mode: 'greenfield',
      tier: '0',
      projectName: 'p',
      description: 'd',
      techStack: 'node-ts',
      testCommand: 'npm test',
    });
    const res = spawnSync('node', [CLI, 'init', '--answers', answers], {
      cwd: dir,
      encoding: 'utf8',
    });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /init --tier=s/);
    assert.match(res.stdout, /"New project"/);
    assert.match(res.stdout, /guide\/tiers\.html#changing-tier/);
    assert.doesNotMatch(res.stdout, /Existing project/);
  });

  it('doctor and the Tier 0 templates no longer suggest "Existing project" to change tier', () => {
    const read = (rel) => fs.readFileSync(path.resolve(__dirname, '../..', rel), 'utf8');
    assert.doesNotMatch(read('src/commands/doctor.js'), /choose "Existing project"/);
    for (const rel of ['templates/tier-0/CLAUDE.md', 'templates/tier-0/GETTING_STARTED.md']) {
      const text = read(rel);
      assert.doesNotMatch(text, /Existing project/, rel);
      assert.match(text, /New project/, rel);
      assert.match(text, /branch/, rel);
    }
  });
});
