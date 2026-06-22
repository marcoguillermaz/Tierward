'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TierwardBackend, TierwardBackendError } = require('../dist/tierwardBackend.js');

const SAMPLE_REPORT = {
  timestamp: '2026-06-08T00:00:00.000Z',
  cwd: '/tmp/project',
  summary: { passed: 26, warned: 1, failed: 1, skipped: 0 },
  checks: [
    { id: 'settings-json', label: '.claude/settings.json present', status: 'pass', info: null },
    {
      id: 'stop-hook',
      label: 'Stop hook configured',
      status: 'fail',
      info: null,
      fix: 'Add a Stop hook to settings.json.',
    },
  ],
};

// Builds a fake ExecFn. When `fail` is set it rejects with an error carrying
// `stdout`, mirroring how child_process surfaces a non-zero exit.
function fakeExec(stdout, { fail = false } = {}) {
  return async () => {
    if (fail) {
      const error = new Error('Command failed with exit code 1');
      error.stdout = stdout;
      throw error;
    }
    return { stdout, stderr: '' };
  };
}

test('getDoctorReport parses JSON from a clean exit', async () => {
  const backend = new TierwardBackend({
    projectRoot: '/tmp/project',
    exec: fakeExec(JSON.stringify(SAMPLE_REPORT)),
  });
  const report = await backend.getDoctorReport();
  assert.equal(report.summary.failed, 1);
  assert.equal(report.checks.length, 2);
});

test('getDoctorReport recovers the report when doctor exits 1', async () => {
  const backend = new TierwardBackend({
    projectRoot: '/tmp/project',
    exec: fakeExec(JSON.stringify(SAMPLE_REPORT), { fail: true }),
  });
  const report = await backend.getDoctorReport();
  assert.equal(report.summary.passed, 26);
});

test('getDoctorReport throws TierwardBackendError when the CLI fails without JSON', async () => {
  const backend = new TierwardBackend({
    projectRoot: '/tmp/project',
    exec: fakeExec('command not found: tierward', { fail: true }),
  });
  await assert.rejects(() => backend.getDoctorReport(), TierwardBackendError);
});

test('getDoctorReport throws TierwardBackendError on malformed JSON', async () => {
  const backend = new TierwardBackend({
    projectRoot: '/tmp/project',
    exec: fakeExec('{ not valid json'),
  });
  await assert.rejects(() => backend.getDoctorReport(), TierwardBackendError);
});

test('cliPath falls back to the default when blank', async () => {
  let receivedCommand;
  const backend = new TierwardBackend({
    projectRoot: '/tmp/project',
    cliPath: '   ',
    exec: async (command) => {
      receivedCommand = command;
      return { stdout: JSON.stringify(SAMPLE_REPORT), stderr: '' };
    },
  });
  await backend.getDoctorReport();
  assert.equal(receivedCommand, 'tierward');
});

test('getHealthSnapshot returns the report and arch-audit status on success', async () => {
  const backend = new TierwardBackend({
    projectRoot: '/tmp/project',
    exec: fakeExec(JSON.stringify(SAMPLE_REPORT)),
  });
  const snapshot = await backend.getHealthSnapshot();
  assert.equal(snapshot.report.summary.failed, 1);
  assert.equal(snapshot.error, null);
  // No `.claude/session/last-arch-audit` under /tmp/project.
  assert.equal(snapshot.archAudit.everRan, false);
});

test('getHealthSnapshot captures a doctor failure instead of throwing', async () => {
  const backend = new TierwardBackend({
    projectRoot: '/tmp/project',
    exec: fakeExec('command not found: tierward', { fail: true }),
  });
  const snapshot = await backend.getHealthSnapshot();
  assert.equal(snapshot.report, null);
  assert.match(snapshot.error, /Failed to run/);
  assert.equal(snapshot.archAudit.everRan, false);
});
