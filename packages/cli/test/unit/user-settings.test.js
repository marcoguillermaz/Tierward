// A project that already has a `.claude/settings.json` keeps it (DEC-55):
// Tierward backs it up before the scaffold writes anything, adds its own hooks
// and never touches the user's permissions or any other key. Its own hooks are
// recognised so a second `init`, or a tier change, replaces them instead of
// adding them again.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import {
  hookGroupPattern,
  isTierwardHookGroup,
  mergeTierwardHooks,
  mergeTierwardSettings,
  backupUserSettings,
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

// Tier S and Tier M in miniature: same gate, different Stop hook, M denies more
const tierS = {
  permissions: { deny: ['Bash(rm -rf /*)', 'Bash(git push --force*)'] },
  hooks: { PreToolUse: [gate('Bash')], Stop: [tierStop('')] },
};
const tierM = {
  permissions: { deny: ['Bash(rm -rf /*)', 'Bash(git push --force*)', 'Bash(DROP TABLE*)'] },
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

  // A template group rendered for another configuration (another test command,
  // another stack guard) is still Tierward's: the raw template, placeholders
  // included, gives the pattern (DEC-80, F8). Text changed outside a
  // placeholder makes the group the user's.
  it('recognises a template group rendered with another test command, from the raw template', () => {
    const raw = {
      hooks: [
        {
          type: 'command',
          command:
            'cat | grep -q stop_hook_active && exit 0; [TEST_GUARD]OUT=$([TEST_COMMAND] 2>&1); [ $? -ne 0 ] && echo block',
        },
      ],
    };
    const rendered = (guard, command) => ({
      hooks: [
        {
          type: 'command',
          command: `cat | grep -q stop_hook_active && exit 0; ${guard}OUT=$(${command} 2>&1); [ $? -ne 0 ] && echo block`,
        },
      ],
    });
    const withPattern = { ...ctx, knownPatterns: [hookGroupPattern(raw)] };
    assert.ok(isTierwardHookGroup(rendered('', 'npm run test:unit'), withPattern));
    assert.ok(
      isTierwardHookGroup(
        rendered('[ ! -f package.json ] && exit 0; ', 'npx vitest run -t "fast"'),
        withPattern,
      ),
    );
    assert.ok(!isTierwardHookGroup(rendered('', 'npm test'), ctx), 'no pattern, no match');
    const edited = rendered('', 'npm test');
    edited.hooks[0].command += ' && ./notify.sh';
    assert.ok(
      !isTierwardHookGroup(edited, withPattern),
      "edited outside a placeholder: the user's",
    );
    assert.ok(!isTierwardHookGroup(userStop, withPattern));
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

  // A re-init with another test command replaces the Stop hook instead of
  // keeping the old one next to the new (DEC-80, F8).
  it('replaces a Tierward hook rendered with the previous test command', () => {
    const raw = tierStop('[TEST_GUARD]').hooks[0].command.replace('npm test', '[TEST_COMMAND]');
    const pattern = hookGroupPattern({ hooks: [{ type: 'command', command: raw }] });
    const withPattern = { ...ctx, knownPatterns: [pattern] };
    const oldStop = {
      hooks: [
        {
          type: 'command',
          command: raw.replace('[TEST_GUARD]', '').replace('[TEST_COMMAND]', 'npx vitest run'),
        },
      ],
    };
    const newTier = {
      hooks: {
        Stop: [
          {
            hooks: [
              {
                type: 'command',
                command: raw
                  .replace('[TEST_GUARD]', '')
                  .replace('[TEST_COMMAND]', 'npm run test:unit'),
              },
            ],
          },
        ],
      },
    };
    const merged = mergeTierwardHooks(
      { hooks: { Stop: [userStop, oldStop] } },
      newTier,
      withPattern,
    );
    assert.deepEqual(merged.hooks.Stop, [userStop, ...newTier.hooks.Stop]);
  });

  // On an event Tierward does not hook there is nothing of Tierward's to
  // replace: the user's wiring stays, even when it only runs a Tierward hook
  // file; only a group copied from a Tierward template is stale (DEC-80, F9).
  it('keeps a user group on an event Tierward does not hook, even one running a Tierward hook file', () => {
    const preCompact = {
      hooks: [
        {
          type: 'command',
          command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/tierward-audit-log.mjs"',
        },
      ],
    };
    const stale = { hooks: [{ type: 'command', command: 'echo "stop failure" >> log' }] };
    const withExtra = {
      ...user,
      hooks: { ...user.hooks, PreCompact: [preCompact], StopFailure: [stale] },
    };
    const merged = mergeTierwardHooks(withExtra, tierM, {
      ...ctx,
      knownGroups: [...ctx.knownGroups, stale],
    });
    assert.deepEqual(merged.hooks.PreCompact, [preCompact], "the user's wiring stays");
    assert.ok(!('StopFailure' in merged.hooks), 'a template group of another tier goes');
  });
});

// DEC-73: Tierward's deny rules join the user's, after them and without
// duplicates; allow and ask rules, and every other key, are never touched.
describe('mergeTierwardSettings - deny rules', () => {
  it("adds the template's deny rules after the user's, skipping the ones already there", () => {
    const withOne = {
      ...user,
      permissions: { ...user.permissions, deny: ['Bash(rm -rf ~*)', 'Bash(DROP TABLE*)'] },
    };
    const merged = mergeTierwardSettings(withOne, tierM, ctx);
    assert.deepEqual(merged.permissions.deny, [
      'Bash(rm -rf ~*)',
      'Bash(DROP TABLE*)',
      'Bash(rm -rf /*)',
      'Bash(git push --force*)',
    ]);
    assert.deepEqual(merged.permissions.allow, user.permissions.allow);
    assert.deepEqual(merged.permissions.ask, user.permissions.ask);
    assert.deepEqual(Object.keys(merged.permissions), Object.keys(withOne.permissions));
    assert.deepEqual(Object.keys(merged), Object.keys(user));
    for (const key of ['$schema', 'env']) assert.deepEqual(merged[key], user[key], key);
    assert.deepEqual(merged.hooks, mergeTierwardHooks(user, tierM, ctx).hooks);
  });

  it('adds permissions.deny when the user has no permissions key, or no deny list', () => {
    const { permissions, ...noPermissions } = user;
    assert.ok(permissions);
    const added = mergeTierwardSettings(noPermissions, tierM, ctx);
    assert.deepEqual(added.permissions, { deny: tierM.permissions.deny });
    const allowOnly = { ...user, permissions: { allow: ['Bash(make test)'] } };
    const merged = mergeTierwardSettings(allowOnly, tierM, ctx);
    assert.deepEqual(merged.permissions, {
      allow: ['Bash(make test)'],
      deny: tierM.permissions.deny,
    });
  });

  it('adds nothing on a second merge, and a tier change adds only the new rules', () => {
    const once = mergeTierwardSettings(user, tierM, ctx);
    assert.deepEqual(mergeTierwardSettings(once, tierM, ctx), once);
    const onS = mergeTierwardSettings(user, tierS, ctx);
    const onM = mergeTierwardSettings(onS, tierM, ctx);
    assert.deepEqual(onM.permissions.deny, [...user.permissions.deny, ...tierM.permissions.deny]);
  });

  it('never writes allow or ask rules from the template', () => {
    const template = {
      ...tierM,
      permissions: { allow: ['Bash(npm:*)'], ask: ['Bash(docker *)'], deny: ['Bash(rm -rf /*)'] },
    };
    const { permissions, ...noPermissions } = user;
    assert.ok(permissions);
    assert.deepEqual(mergeTierwardSettings(noPermissions, template, ctx).permissions, {
      deny: ['Bash(rm -rf /*)'],
    });
  });
});

describe('backupUserSettings', () => {
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

  it('writes a timestamped backup of the original bytes and returns them with its path', async () => {
    const raw = JSON.stringify(user, null, 4) + '\n';
    await fs.writeFile(settingsPath, raw);
    const now = new Date('2026-10-12T08:30:00Z');
    const result = await backupUserSettings(settingsPath, now);
    assert.deepEqual(result, { raw, backup: `${settingsPath}.bak.2026-10-12T08-30-00` });
    assert.equal(await fs.readFile(result.backup, 'utf8'), raw);
    assert.equal(await fs.readFile(settingsPath, 'utf8'), raw, 'the file itself is untouched');
  });

  // Two inits within the same second (a script, a retry) must not lose the
  // original under the already-merged file (DEC-80, F10).
  it('never overwrites an earlier backup: a second one in the same second gets a numbered name', async () => {
    await fs.writeFile(settingsPath, 'ORIGINAL\n');
    const now = new Date('2026-10-12T08:30:00Z');
    const first = await backupUserSettings(settingsPath, now);
    await fs.writeFile(settingsPath, 'MERGED\n');
    const second = await backupUserSettings(settingsPath, now);
    assert.equal(first.backup, `${settingsPath}.bak.2026-10-12T08-30-00`);
    assert.equal(second.backup, `${settingsPath}.bak.2026-10-12T08-30-00-1`);
    assert.equal(await fs.readFile(first.backup, 'utf8'), 'ORIGINAL\n');
    assert.equal(await fs.readFile(second.backup, 'utf8'), 'MERGED\n');
    const third = await backupUserSettings(settingsPath, now);
    assert.equal(third.backup, `${settingsPath}.bak.2026-10-12T08-30-00-2`);
  });

  it('backs up a file that is not valid JSON too: the scaffold may overwrite it', async () => {
    const raw = '{ "permissions": ';
    await fs.writeFile(settingsPath, raw);
    const { backup } = await backupUserSettings(settingsPath);
    assert.equal(await fs.readFile(backup, 'utf8'), raw);
  });

  it('returns null, and writes nothing, when the project has no settings.json', async () => {
    assert.equal(await backupUserSettings(settingsPath), null);
    assert.deepEqual(await fs.readdir(path.dirname(settingsPath)), []);
  });
});

describe('keepUserSettings', () => {
  let dir;
  let settingsPath;
  const saved = (raw) => ({ raw, backup: `${settingsPath}.bak.2026-10-12T08-30-00` });
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tierward-user-settings-'));
    settingsPath = path.join(dir, '.claude', 'settings.json');
    await fs.ensureDir(path.dirname(settingsPath));
  });
  afterEach(async () => {
    await fs.remove(dir);
  });

  it('writes the merged file over what the scaffold wrote, and reports the backup made at read time', async () => {
    const raw = JSON.stringify(user, null, 4) + '\n';
    await fs.writeFile(settingsPath, raw);
    const read = await backupUserSettings(settingsPath, new Date('2026-10-12T08:30:00Z'));
    await fs.writeFile(settingsPath, 'overwritten by the scaffold');
    const { backup } = await keepUserSettings(settingsPath, read, tierM, ctx);
    assert.equal(backup, read.backup);
    assert.equal(await fs.readFile(backup, 'utf8'), raw);
    assert.deepEqual(await fs.readJson(settingsPath), mergeTierwardSettings(user, tierM, ctx));
    const backups = (await fs.readdir(path.dirname(settingsPath))).filter((f) =>
      f.includes('.bak'),
    );
    assert.equal(backups.length, 1, 'no second backup');
  });

  it('lists the deny rules it added, with the backup, and stays silent when none was', async () => {
    const logs = [];
    const origLog = console.log;
    console.log = (msg) => logs.push(String(msg));
    let first;
    let second;
    try {
      first = await keepUserSettings(settingsPath, saved(JSON.stringify(user)), tierM, ctx);
      const merged = await fs.readFile(settingsPath, 'utf8');
      logs.length = 0;
      second = await keepUserSettings(settingsPath, saved(merged), tierM, ctx);
    } finally {
      console.log = origLog;
    }
    assert.deepEqual(first.addedDeny, tierM.permissions.deny);
    assert.deepEqual(second.addedDeny, []);
    assert.doesNotMatch(
      logs.join('\n'),
      /deny rules added/,
      'no deny line when every rule was already there',
    );
  });

  it('prints the added deny rules and never an allow or ask line', async () => {
    const logs = [];
    const origLog = console.log;
    console.log = (msg) => logs.push(String(msg));
    try {
      await keepUserSettings(settingsPath, saved(JSON.stringify(user)), tierM, ctx);
    } finally {
      console.log = origLog;
    }
    const out = logs.join('\n');
    for (const rule of tierM.permissions.deny) assert.ok(out.includes(rule), rule);
    assert.match(out, /deny rules/i);
    assert.ok(out.includes(saved('').backup), 'names the backup');
    assert.doesNotMatch(out, /Bash\(make test\)|Bash\(docker \*\)/, 'user allow/ask not listed');
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
      result = await keepUserSettings(
        settingsPath,
        saved(JSON.stringify(withOld)),
        tierWithStart,
        ctx,
      );
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
      result = await keepUserSettings(
        settingsPath,
        saved(JSON.stringify(onlyOwnEvent)),
        tierM,
        ctx,
      );
    } finally {
      console.log = origLog;
    }
    assert.deepEqual(result.keptHooks, []);
    assert.doesNotMatch(logs.join('\n'), /your hooks below/, 'no kept-hooks line');
  });

  it('puts a malformed file back as it was, with a warning that names the backup', async () => {
    const raw = '{ "permissions": ';
    await fs.writeFile(settingsPath, raw);
    const read = await backupUserSettings(settingsPath);
    await fs.writeFile(settingsPath, 'overwritten by the scaffold');
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (msg) => warnings.push(msg);
    try {
      const result = await keepUserSettings(settingsPath, read, tierM, ctx);
      assert.equal(result, null);
    } finally {
      console.warn = origWarn;
    }
    assert.equal(await fs.readFile(settingsPath, 'utf8'), raw);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /hooks were not added/i);
    assert.ok(warnings[0].includes(read.backup), 'names the backup');
    assert.equal(await fs.readFile(read.backup, 'utf8'), raw);
  });
});
