// A project that already has a `.claude/settings.json` keeps it (DEC-55):
// Tierward adds its own hooks after a backup and never touches the user's
// permissions or any other key. Its own hooks are recognised so a second
// `init`, or a tier change, replaces them instead of adding them again.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import {
  isTierwardHookGroup,
  mergeTierwardHooks,
  keepUserSettings,
} from '../../src/scaffold/user-settings.js';

const hookFiles = ['tierward-governance-gate.mjs', 'tierward-audit-log.mjs'];
const gate = (matcher) => ({
  matcher,
  hooks: [
    {
      type: 'command',
      command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/tierward-governance-gate.mjs"',
    },
  ],
});
const tierStop = (extra) => ({
  hooks: [
    { type: 'command', command: `cat | grep -q stop_hook_active && exit 0; ${extra}npm test` },
  ],
});
const userStop = { hooks: [{ type: 'command', command: './scripts/notify-done.sh' }] };

// Tier S and Tier M in miniature: same gate, different Stop hook
const tierS = { hooks: { PreToolUse: [gate('Bash')], Stop: [tierStop('')] } };
const tierM = {
  hooks: {
    PreToolUse: [gate('Bash'), gate('^mcp__.+__(merge_pull_request|push_files)$')],
    Stop: [tierStop('cd "$CLAUDE_PROJECT_DIR" || exit 0; ')],
  },
};
const knownGroups = [...Object.values(tierS.hooks), ...Object.values(tierM.hooks)].flat();
const ctx = { knownGroups, hookFiles };

const user = {
  $schema: 'https://json.schemastore.org/claude-code-settings.json',
  permissions: {
    allow: ['Bash(make test)'],
    ask: ['Bash(docker *)'],
    deny: ['Bash(rm -rf ~*)'],
  },
  env: { MY_VAR: '1' },
  hooks: { Stop: [userStop] },
};

describe('isTierwardHookGroup', () => {
  it('recognises a group from a Tierward template, and one that only runs Tierward hook files', () => {
    assert.ok(isTierwardHookGroup(tierStop(''), ctx));
    assert.ok(isTierwardHookGroup(gate('^mcp__.+__merge_pull_request$'), ctx), 'old matcher');
  });

  it('never claims a user hook, nor a group that mixes a user command with a Tierward one', () => {
    assert.ok(!isTierwardHookGroup(userStop, ctx));
    const mixed = { matcher: 'Bash', hooks: [...gate('Bash').hooks, userStop.hooks[0]] };
    assert.ok(!isTierwardHookGroup(mixed, ctx));
  });
});

describe('mergeTierwardHooks', () => {
  it('keeps every key but hooks exactly as the user wrote it, permissions included', () => {
    const merged = mergeTierwardHooks(user, tierM, ctx);
    for (const key of ['$schema', 'permissions', 'env']) {
      assert.deepEqual(merged[key], user[key], key);
    }
    assert.deepEqual(Object.keys(merged), Object.keys(user));
  });

  it("adds Tierward's hooks and keeps the user's own hooks on the same event", () => {
    const merged = mergeTierwardHooks(user, tierM, ctx);
    assert.deepEqual(merged.hooks.Stop, [userStop, ...tierM.hooks.Stop]);
    assert.deepEqual(merged.hooks.PreToolUse, tierM.hooks.PreToolUse);
  });

  it('adds nothing on a second run', () => {
    const once = mergeTierwardHooks(user, tierM, ctx);
    assert.deepEqual(mergeTierwardHooks(once, tierM, ctx), once);
  });

  it("replaces the previous tier's hooks on a tier change instead of adding to them", () => {
    const onS = mergeTierwardHooks(user, tierS, ctx);
    const onM = mergeTierwardHooks(onS, tierM, ctx);
    assert.deepEqual(onM, mergeTierwardHooks(user, tierM, ctx));
    assert.ok(!JSON.stringify(onM.hooks.Stop).includes(JSON.stringify(tierStop(''))));
  });

  it('adds a hooks key when the user had none', () => {
    const { hooks, ...noHooks } = user;
    assert.ok(hooks);
    const merged = mergeTierwardHooks(noHooks, tierM, ctx);
    assert.deepEqual(merged.hooks, tierM.hooks);
    assert.deepEqual(merged.permissions, user.permissions);
  });
});

describe('keepUserSettings', () => {
  let dir;
  let settingsPath;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tierward-user-settings-'));
    settingsPath = path.join(dir, '.claude', 'settings.json');
    await fs.ensureDir(path.dirname(settingsPath));
  });
  afterEach(async () => {
    await fs.remove(dir);
  });

  it('writes a timestamped backup of the original bytes, then the merged file', async () => {
    const raw = JSON.stringify(user, null, 4) + '\n';
    await fs.writeFile(settingsPath, 'overwritten by the scaffold');
    const now = new Date('2026-10-12T08:30:00Z');
    const { backup } = await keepUserSettings(settingsPath, raw, tierM, ctx, now);
    assert.equal(backup, `${settingsPath}.bak.2026-10-12T08-30-00`);
    assert.equal(await fs.readFile(backup, 'utf8'), raw);
    assert.deepEqual(await fs.readJson(settingsPath), mergeTierwardHooks(user, tierM, ctx));
  });

  // DEC-60 f: an inline hook an earlier Tierward version wrote is not recognised
  // and stays next to the new one, so init lists the user hooks it kept on the
  // events Tierward also hooks.
  it("lists the user's hooks it kept on the events Tierward hooks, with the backup", async () => {
    const oldInline = {
      hooks: [{ type: 'command', command: 'mkdir -p ~/.claude/audit && echo start' }],
    };
    const withOld = { ...user, hooks: { Stop: [userStop], SessionStart: [oldInline] } };
    const tierWithStart = {
      hooks: { ...tierM.hooks, SessionStart: [gate(undefined)] },
    };
    const logs = [];
    const origLog = console.log;
    console.log = (msg) => logs.push(String(msg));
    let result;
    try {
      result = await keepUserSettings(settingsPath, JSON.stringify(withOld), tierWithStart, ctx);
    } finally {
      console.log = origLog;
    }
    assert.deepEqual(result.keptHooks, [
      { event: 'Stop', commands: ['./scripts/notify-done.sh'] },
      { event: 'SessionStart', commands: ['mkdir -p ~/.claude/audit && echo start'] },
    ]);
    const out = logs.join('\n');
    assert.match(out, /Stop: \.\/scripts\/notify-done\.sh/);
    assert.match(out, /SessionStart: mkdir -p ~\/\.claude\/audit && echo start/);
    assert.ok(out.includes(result.backup), 'names the backup');
  });

  it('prints nothing when no user hook shares an event with Tierward', async () => {
    const onlyOwnEvent = { ...user, hooks: { Notification: [userStop] } };
    const logs = [];
    const origLog = console.log;
    console.log = (msg) => logs.push(String(msg));
    let result;
    try {
      result = await keepUserSettings(settingsPath, JSON.stringify(onlyOwnEvent), tierM, ctx);
    } finally {
      console.log = origLog;
    }
    assert.deepEqual(result.keptHooks, []);
    assert.deepEqual(logs, []);
  });

  it('leaves a malformed file as it was, with a warning and no backup', async () => {
    const raw = '{ "permissions": ';
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (msg) => warnings.push(msg);
    try {
      const result = await keepUserSettings(settingsPath, raw, tierM, ctx);
      assert.equal(result, null);
    } finally {
      console.warn = origWarn;
    }
    assert.equal(await fs.readFile(settingsPath, 'utf8'), raw);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /hooks were not added/i);
    assert.deepEqual(
      (await fs.readdir(path.dirname(settingsPath))).filter((f) => f.includes('.bak')),
      [],
    );
  });
});
