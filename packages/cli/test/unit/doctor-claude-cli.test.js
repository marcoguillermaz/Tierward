import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

// CI runners have no Claude Code (GitHub's ubuntu-latest image does not list
// it), so the copyable tierward-verify.yml failed on every pull request: the
// claude-cli check describes the runner, not the project (DEC-68).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '../../src/index.js');
const ANSWERS = path.resolve(
  __dirname,
  '../fixtures/wizard-answers/greenfield-tier-m-node-full.json',
);

let TMP;
let NO_CLAUDE_PATH;

before(async () => {
  TMP = await fs.mkdtemp(path.join(os.tmpdir(), 'doctor-claude-cli-test-'));
  NO_CLAUDE_PATH = path.join(TMP, 'empty-bin');
  await fs.ensureDir(NO_CLAUDE_PATH);
});

after(async () => {
  await fs.remove(TMP);
});

// `doctor --report` with no `claude` on PATH. `ci` is the value of the CI
// variable, which GitHub Actions always sets to "true"; undefined removes it.
function doctorReport(cwd, ci) {
  const env = { ...process.env, PATH: NO_CLAUDE_PATH };
  delete env.CI;
  if (ci !== undefined) env.CI = ci;
  const res = spawnSync(process.execPath, [CLI, 'doctor', '--report'], {
    cwd,
    env,
    encoding: 'utf8',
  });
  return { status: res.status, report: JSON.parse(res.stdout) };
}

const claudeCli = (report) => report.checks.find((c) => c.id === 'claude-cli');

describe('doctor claude-cli check without Claude Code on PATH', () => {
  it('fails outside CI', async () => {
    const dir = await fs.mkdtemp(path.join(TMP, 'local-'));
    assert.equal(claudeCli(doctorReport(dir).report).status, 'fail');
  });

  it('fails when CI is "false"', async () => {
    const dir = await fs.mkdtemp(path.join(TMP, 'ci-false-'));
    assert.equal(claudeCli(doctorReport(dir, 'false').report).status, 'fail');
  });

  it('warns when CI is set', async () => {
    const dir = await fs.mkdtemp(path.join(TMP, 'ci-'));
    const check = claudeCli(doctorReport(dir, 'true').report);
    assert.equal(check.status, 'warn');
    assert.match(check.fix, /CI/);
  });

  it('lets a clean scaffold pass in CI, as tierward-verify.yml runs it', async () => {
    const dir = await fs.mkdtemp(path.join(TMP, 'scaffold-'));
    const init = spawnSync(
      process.execPath,
      [CLI, 'init', '--answers', JSON.stringify(await fs.readJson(ANSWERS))],
      { cwd: dir, encoding: 'utf8' },
    );
    assert.equal(init.status, 0, init.stderr);

    const ci = doctorReport(dir, 'true');
    assert.equal(ci.report.summary.failed, 0);
    assert.equal(ci.status, 0);

    const local = doctorReport(dir);
    assert.equal(local.report.summary.failed, 1);
    assert.equal(local.status, 1);
  });
});
