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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');

function stopHookCommand(tier) {
  const raw = fs.readFileSync(path.join(TEMPLATES_DIR, tier, '.claude', 'settings.json'), 'utf8');
  return JSON.parse(raw).hooks.Stop[0].hooks[0].command;
}

// Run the resolved hook the way Claude Code does: under a shell, with the
// `stop_hook_active` / `CLAUDE_PROJECT_DIR` env it provides, capturing only the
// hook's stdout (stderr carries diagnostics and is intentionally discarded).
function runHook(command, testCmd) {
  const resolved = command.replace(/\[TEST_COMMAND\]/g, testCmd);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-stophook-'));
  try {
    const stdout = execFileSync('bash', ['-c', resolved], {
      env: { ...process.env, stop_hook_active: '', CLAUDE_PROJECT_DIR: dir },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return { exit: 0, stdout };
  } catch (err) {
    return { exit: err.status ?? 1, stdout: (err.stdout || '').toString() };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

for (const tier of ['tier-m', 'tier-l']) {
  describe(`Stop hook behavior — ${tier}`, () => {
    const command = stopHookCommand(tier);

    it('exits 0 with empty stdout when the test command passes', () => {
      const { exit, stdout } = runHook(command, 'true');
      assert.equal(exit, 0, 'hook must exit 0 on success (no spurious non-blocking error)');
      assert.equal(stdout.trim(), '', 'stdout must be empty on success');
    });

    it('exits 0 and emits only parseable block JSON when the test command fails', () => {
      // Failing command that prints to STDOUT first — the exact pollution case.
      const { exit, stdout } = runHook(command, 'echo "ERROR: build broke"; false');
      assert.equal(exit, 0, 'hook must exit 0 so Claude Code parses the JSON');
      const decision = JSON.parse(stdout.trim());
      assert.equal(decision.decision, 'block', 'block decision must be honored');
      assert.ok(decision.reason, 'block reason must be present');
    });
  });
}
