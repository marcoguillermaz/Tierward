'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ARCH_AUDIT_STALE_DAYS,
  archAuditAgeDays,
  describeArchAudit,
  evaluateHealth,
} = require('../dist/health.js');

const NOW = 1_700_000_000;
const DAY = 86_400;
const ranDaysAgo = (days) => ({
  everRan: true,
  lastRunUnix: NOW - days * DAY,
  lastRunIso: new Date((NOW - days * DAY) * 1000).toISOString(),
});
const NEVER = { everRan: false, lastRunUnix: null, lastRunIso: null };
const summary = (s) => ({ passed: 0, warned: 0, failed: 0, skipped: 0, ...s });

test('evaluateHealth: failures dominate over warnings', () => {
  const d = evaluateHealth({
    summary: summary({ passed: 10, warned: 4, failed: 2 }),
    archAudit: NEVER,
    nowUnix: NOW,
  });
  assert.equal(d.severity, 'error');
  assert.match(d.text, /2✗/);
});

test('evaluateHealth: warnings without failures are a warning', () => {
  const d = evaluateHealth({
    summary: summary({ passed: 10, warned: 3 }),
    archAudit: NEVER,
    nowUnix: NOW,
  });
  assert.equal(d.severity, 'warning');
  assert.match(d.text, /3⚠/);
});

test('evaluateHealth: all green with no arch-audit is ok', () => {
  const d = evaluateHealth({ summary: summary({ passed: 12 }), archAudit: NEVER, nowUnix: NOW });
  assert.equal(d.severity, 'ok');
  assert.equal(d.text, '$(check) Tierward');
});

test('evaluateHealth: a lapsed arch-audit cadence bumps a clean state to warning', () => {
  const d = evaluateHealth({
    summary: summary({ passed: 12 }),
    archAudit: ranDaysAgo(10),
    nowUnix: NOW,
  });
  assert.equal(d.severity, 'warning');
  // No doctor warnings, so the count glyph is omitted.
  assert.equal(d.text, '$(warning) Tierward');
});

test('evaluateHealth: a recent arch-audit run does not bump severity', () => {
  const d = evaluateHealth({
    summary: summary({ passed: 12 }),
    archAudit: ranDaysAgo(3),
    nowUnix: NOW,
  });
  assert.equal(d.severity, 'ok');
});

test('evaluateHealth: a never-run arch-audit stays informational (no bump)', () => {
  const d = evaluateHealth({ summary: summary({ passed: 12 }), archAudit: NEVER, nowUnix: NOW });
  assert.equal(d.severity, 'ok');
  assert.match(d.tooltip, /Arch-audit: never run/);
});

test('evaluateHealth: tooltip carries the full doctor breakdown', () => {
  const d = evaluateHealth({
    summary: summary({ passed: 6, warned: 3, failed: 3, skipped: 17 }),
    archAudit: NEVER,
    nowUnix: NOW,
  });
  assert.match(d.tooltip, /6\/29 passed · 3 failed · 3 warnings · 17 skipped/);
});

test('archAuditAgeDays: null when never run, computed otherwise', () => {
  assert.equal(archAuditAgeDays(NEVER, NOW), null);
  assert.equal(archAuditAgeDays(ranDaysAgo(5), NOW), 5);
});

test('describeArchAudit: never run', () => {
  assert.equal(describeArchAudit(NEVER, NOW), 'never run');
});

test('describeArchAudit: fresh run reads "Nd ago" without a stale marker', () => {
  const line = describeArchAudit(ranDaysAgo(3), NOW);
  assert.equal(line, 'last run 3d ago');
});

test('describeArchAudit: stale run past the threshold is flagged', () => {
  const line = describeArchAudit(ranDaysAgo(10), NOW);
  assert.match(line, new RegExp(`stale \\(>${ARCH_AUDIT_STALE_DAYS}d\\)`));
});

test('describeArchAudit: unparseable record is reported, not crashed on', () => {
  const line = describeArchAudit({ everRan: true, lastRunUnix: null, lastRunIso: null }, NOW);
  assert.match(line, /unparseable/);
});
