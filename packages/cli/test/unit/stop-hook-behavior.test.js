// Behavioral regression guard for the Tier M/L Stop hook (§7 real-user-path).
//
// Reproduces the two bugs fixed in `fix(hooks): Tier M/L Stop hook now blocks`:
//   1. On test SUCCESS the hook must exit 0 with empty stdout — otherwise
//      Claude Code shows a spurious "Stop hook error: non-blocking status code".
//   2. On test FAILURE the hook's stdout must contain ONLY the block JSON
//      (Claude Code does JSON.parse on the whole stdout, exit 0). If build
//      diagnostics leak onto stdout, the parse fails and the block is a
//      silent no-op — the gate never fires.
//
// The failing test command below writes to STDOUT before failing, which is the
// exact scenario that broke the legacy `... 2>&1 | tail; [[ PIPESTATUS ]] && echo`
// shape. Reverting to it makes case 2 fail here.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTestGuard } from '../../src/scaffold/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');

function stopHookCommand(tier) {
  const raw = fs.readFileSync(path.join(TEMPLATES_DIR, tier, '.claude', 'settings.json'), 'utf8');
  return JSON.parse(raw).hooks.Stop[0].hooks[0].command;
}

// Run the resolved hook the way Claude Code does: under a shell, in the project
// directory, with `CLAUDE_PROJECT_DIR` in the env and the hook input as JSON on
// stdin (`stop_hook_active` is a stdin field, never an env var), capturing only
// the hook's stdout (stderr carries diagnostics, discarded).
//
// [TEST_GUARD] is resolved with the given stack the same way scaffold/index.js
// does at init time. `seedMarker: true` writes the stack's project marker into
// the temp dir so the guard does NOT skip — that isolates the test gate's
// success/failure behavior from the greenfield guard-skip path.
function runHook(
  command,
  testCmd,
  { seedMarker = false, techStack = 'node-ts', stdin = null, env = {} } = {},
) {
  const resolved = command
    .replace(/\[TEST_GUARD\]/g, buildTestGuard(techStack))
    .replace(/\[TEST_COMMAND\]/g, testCmd);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-stophook-'));
  if (seedMarker) fs.writeFileSync(path.join(dir, 'package.json'), '{}\n');
  try {
    const stdout = execFileSync('bash', ['-c', resolved], {
      cwd: dir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir, ...env },
      encoding: 'utf8',
      ...(stdin === null
        ? { stdio: ['ignore', 'pipe', 'ignore'] }
        : { input: JSON.stringify(stdin), stdio: ['pipe', 'pipe', 'ignore'] }),
    });
    return { exit: 0, stdout };
  } catch (err) {
    return { exit: err.status ?? 1, stdout: (err.stdout || '').toString() };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

for (const tier of ['tier-0', 'tier-s', 'tier-m', 'tier-l']) {
  describe(`Stop hook behavior — ${tier}`, () => {
    const command = stopHookCommand(tier);

    it('exits 0 with empty stdout when the test command passes', () => {
      const { exit, stdout } = runHook(command, 'true', { seedMarker: true });
      assert.equal(exit, 0, 'hook must exit 0 on success (no spurious non-blocking error)');
      assert.equal(stdout.trim(), '', 'stdout must be empty on success');
    });

    it('exits 0 and emits only parseable block JSON when the test command fails', () => {
      // Failing command that prints to STDOUT first — the exact pollution case.
      const { exit, stdout } = runHook(command, 'echo "ERROR: build broke"; false', {
        seedMarker: true,
      });
      assert.equal(exit, 0, 'hook must exit 0 so Claude Code parses the JSON');
      const decision = JSON.parse(stdout.trim());
      assert.equal(decision.decision, 'block', 'block decision must be honored');
      assert.ok(decision.reason, 'block reason must be present');
    });

    // NF-3 regression: on an un-scaffolded greenfield repo (no project marker,
    // hence no test runner), the [TEST_GUARD] must skip the gate so the hook
    // does not deadlock task completion. Without the guard, the failing test
    // command below would block every Stop.
    it('skips the gate (exit 0, empty stdout) on a greenfield repo with no test infra', () => {
      const { exit, stdout } = runHook(command, 'echo "no tests here"; false', {
        seedMarker: false,
        techStack: 'node-ts',
      });
      assert.equal(exit, 0, 'guard must let the hook exit 0 when no project marker exists');
      assert.equal(
        stdout.trim(),
        '',
        'guard must skip silently — no block JSON on a greenfield repo',
      );
    });

    // Anti-loop guard: Claude Code sends `stop_hook_active: true` on stdin when
    // the stop follows a block from this hook. The hook must then let Claude stop
    // instead of blocking again. Shape observed from Claude Code: compact JSON.
    const failing = 'echo "ERROR: still broken"; false';
    it('blocks on the first stop (stdin stop_hook_active false)', () => {
      const { exit, stdout } = runHook(command, failing, {
        seedMarker: true,
        stdin: { hook_event_name: 'Stop', stop_hook_active: false },
      });
      assert.equal(exit, 0);
      assert.equal(JSON.parse(stdout.trim()).decision, 'block');
    });

    it('lets Claude stop on the stop after a block (stdin stop_hook_active true)', () => {
      const { exit, stdout } = runHook(command, failing, {
        seedMarker: true,
        stdin: { hook_event_name: 'Stop', stop_hook_active: true },
      });
      assert.equal(exit, 0);
      assert.equal(stdout.trim(), '', 'no second block once stop_hook_active is true');
    });

    it('ignores a stop_hook_active environment variable (Claude Code sets none)', () => {
      const { stdout } = runHook(command, failing, {
        seedMarker: true,
        stdin: { hook_event_name: 'Stop', stop_hook_active: false },
        env: { stop_hook_active: '1' },
      });
      assert.equal(JSON.parse(stdout.trim()).decision, 'block');
    });
  });
}
