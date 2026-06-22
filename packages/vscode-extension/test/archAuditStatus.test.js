'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { TierwardBackend } = require('../dist/tierwardBackend.js');

function fixtureWith(record) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tierward-arch-'));
  if (record !== undefined) {
    const file = path.join(root, '.claude', 'session', 'last-arch-audit');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, record);
  }
  return root;
}

test('getArchAuditStatus parses a valid epoch record', async () => {
  const epoch = 1_700_000_000;
  const root = fixtureWith(`${epoch}\n`);
  try {
    const status = await new TierwardBackend({ projectRoot: root }).getArchAuditStatus();
    assert.equal(status.everRan, true);
    assert.equal(status.lastRunUnix, epoch);
    assert.equal(status.lastRunIso, new Date(epoch * 1000).toISOString());
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('getArchAuditStatus reports everRan: false when the record is absent', async () => {
  const root = fixtureWith(undefined);
  try {
    const status = await new TierwardBackend({ projectRoot: root }).getArchAuditStatus();
    assert.deepEqual(status, { everRan: false, lastRunUnix: null, lastRunIso: null });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('getArchAuditStatus marks an unparseable record as run-but-unknown', async () => {
  const root = fixtureWith('not-a-number');
  try {
    const status = await new TierwardBackend({ projectRoot: root }).getArchAuditStatus();
    assert.deepEqual(status, { everRan: true, lastRunUnix: null, lastRunIso: null });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
