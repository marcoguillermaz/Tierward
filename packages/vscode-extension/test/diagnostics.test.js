'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDiagnostics, CHECK_FILE_MAP } = require('../dist/diagnostics.js');

const NOW = 1_700_000_000;
const DAY = 86_400;
const NEVER = { everRan: false, lastRunUnix: null, lastRunIso: null };
const ranDaysAgo = (days) => ({
  everRan: true,
  lastRunUnix: NOW - days * DAY,
  lastRunIso: new Date((NOW - days * DAY) * 1000).toISOString(),
});

const REPORT = {
  timestamp: '2026-06-16T00:00:00.000Z',
  cwd: '/x',
  summary: { passed: 1, warned: 2, failed: 1, skipped: 1 },
  checks: [
    { id: 'claude-cli', label: 'Claude Code CLI installed', status: 'pass', info: null },
    {
      id: 'settings-json',
      label: '.claude/settings.json present',
      status: 'fail',
      fix: 'Run `claude-dev-kit init`.',
    },
    {
      id: 'security-rules',
      label: '.claude/rules/security.md present',
      status: 'warn',
      fix: 'Copy security.md from the template.',
    },
    { id: 'skill-md-size-budget', label: 'Skill bodies ≤ 500 lines', status: 'warn', info: 'arch-audit (652)' },
    { id: 'claudemd-skills-directory-parity', label: 'parity', status: 'skip' },
  ],
};

test('buildDiagnostics drops pass/skip and keeps fail/warn', () => {
  const specs = buildDiagnostics(REPORT, NEVER, NOW);
  const codes = specs.map((s) => s.code).sort();
  assert.deepEqual(codes, ['security-rules', 'settings-json', 'skill-md-size-budget']);
});

test('buildDiagnostics maps fail→error, warn→warning', () => {
  const specs = buildDiagnostics(REPORT, NEVER, NOW);
  assert.equal(specs.find((s) => s.code === 'settings-json').severity, 'error');
  assert.equal(specs.find((s) => s.code === 'security-rules').severity, 'warning');
});

test('buildDiagnostics resolves the check file from the map', () => {
  const specs = buildDiagnostics(REPORT, NEVER, NOW);
  assert.equal(specs.find((s) => s.code === 'settings-json').relPath, '.claude/settings.json');
  assert.equal(specs.find((s) => s.code === 'security-rules').relPath, '.claude/rules/security.md');
});

test('buildDiagnostics leaves unmapped checks at relPath null (→ hub)', () => {
  const specs = buildDiagnostics(REPORT, NEVER, NOW);
  assert.equal(specs.find((s) => s.code === 'skill-md-size-budget').relPath, null);
});

test('buildDiagnostics folds the fix into the message', () => {
  const specs = buildDiagnostics(REPORT, NEVER, NOW);
  assert.match(specs.find((s) => s.code === 'settings-json').message, /Run `claude-dev-kit init`\./);
});

test('buildDiagnostics adds a stale arch-audit warning', () => {
  const specs = buildDiagnostics(REPORT, ranDaysAgo(10), NOW);
  const stale = specs.find((s) => s.code === 'arch-audit-stale');
  assert.ok(stale);
  assert.equal(stale.severity, 'warning');
  assert.equal(stale.relPath, '.claude/session/last-arch-audit');
});

test('buildDiagnostics omits the arch-audit warning when fresh or never run', () => {
  assert.equal(
    buildDiagnostics(REPORT, ranDaysAgo(3), NOW).find((s) => s.code === 'arch-audit-stale'),
    undefined,
  );
  assert.equal(
    buildDiagnostics(REPORT, NEVER, NOW).find((s) => s.code === 'arch-audit-stale'),
    undefined,
  );
});

test('CHECK_FILE_MAP points the three CLAUDE.md checks at CLAUDE.md', () => {
  for (const id of ['claude-md', 'claude-md-size', 'no-secrets-claude-md']) {
    assert.equal(CHECK_FILE_MAP[id], 'CLAUDE.md');
  }
});
