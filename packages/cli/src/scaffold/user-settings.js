// A project that already has a `.claude/settings.json` keeps it (DEC-55):
// Tierward writes a timestamped backup before the scaffold touches anything,
// then adds its own hooks and its own deny rules (DEC-73). The user's allow
// and ask rules and every other key stay exactly as they were, so an `init`
// never overrides what the user allowed or asked, and never grants anything.
//
// Tierward's own hook groups are recognised, so a second `init` or a tier
// change replaces them instead of adding them again: a group is Tierward's
// when it equals a group of a Tierward template rendered for this project,
// when it matches a template group rendered for any project (the raw
// template with its placeholders, `[TEST_COMMAND]` for one, gives the
// pattern), or when each of its hooks only runs one of Tierward's hook files.
// A group the user extended with a command of their own is left alone.

import fs from 'fs-extra';
import { backupPath } from '../commands/upgrade.js';

const HOOK_FILE_COMMAND = /^node "\$CLAUDE_PROJECT_DIR\/\.claude\/hooks\/([\w.-]+)"$/;

/**
 * A regular expression matching the JSON of a template hook group rendered
 * for any project: each `[PLACEHOLDER]` of the raw template matches anything,
 * the rest matches as written.
 */
export function hookGroupPattern(rawGroup) {
  const escaped = JSON.stringify(rawGroup).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\\\[[A-Z_]+\\\]/g, '[\\s\\S]*?')}$`);
}

/**
 * Whether a hook group was copied from a Tierward template: it equals a
 * template group rendered for this project (`knownGroups`) or matches one
 * rendered for any project (`knownPatterns`, see hookGroupPattern).
 */
export function isTemplateHookGroup(group, { knownGroups, knownPatterns = [] }) {
  const json = JSON.stringify(group);
  if (knownGroups.some((known) => JSON.stringify(known) === json)) return true;
  return knownPatterns.some((pattern) => pattern.test(json));
}

/**
 * Whether a hook group (one entry of `hooks.<Event>`) belongs to Tierward: a
 * template group, or one whose every hook only runs a Tierward hook file
 * (`hookFiles`: the names of those files).
 */
export function isTierwardHookGroup(group, context) {
  if (isTemplateHookGroup(group, context)) return true;
  const { hookFiles } = context;
  const hooks = group?.hooks;
  return (
    Array.isArray(hooks) &&
    hooks.length > 0 &&
    hooks.every((hook) => {
      const match = HOOK_FILE_COMMAND.exec(hook?.command || '');
      return Boolean(match) && hookFiles.includes(match[1]);
    })
  );
}

/**
 * The user's settings with Tierward's hooks in place of any earlier Tierward
 * hooks. Every key but `hooks` is returned as the user wrote it, in the same
 * order. Within an event the user's own groups come first; events follow the
 * Tierward template's order, then the events only the user hooks. On those
 * events nothing of Tierward's is added, so only a group copied from a
 * Tierward template (of any tier) is stale and goes; a group the user wired
 * there stays, even one that only runs a Tierward hook file.
 */
export function mergeTierwardHooks(user, tierward, context) {
  const userHooks = user.hooks && typeof user.hooks === 'object' ? user.hooks : {};
  const tierwardHooks = tierward.hooks || {};
  const groupsOf = (event) => (Array.isArray(userHooks[event]) ? userHooks[event] : []);
  const ownGroups = (event) =>
    groupsOf(event).filter((group) => !isTierwardHookGroup(group, context));

  const hooks = {};
  for (const [event, groups] of Object.entries(tierwardHooks)) {
    hooks[event] = [...ownGroups(event), ...groups];
  }
  for (const event of Object.keys(userHooks)) {
    if (event in hooks) continue;
    const own = groupsOf(event).filter((group) => !isTemplateHookGroup(group, context));
    if (own.length > 0) hooks[event] = own;
  }

  if (!('hooks' in user)) return { ...user, hooks };
  return Object.fromEntries(
    Object.entries(user).map(([key, value]) => [key, key === 'hooks' ? hooks : value]),
  );
}

/**
 * Tierward's deny rules the user's file does not have yet, in template order.
 */
export function addedDenyRules(user, tierward) {
  const own = Array.isArray(user.permissions?.deny) ? user.permissions.deny : [];
  const rules = Array.isArray(tierward.permissions?.deny) ? tierward.permissions.deny : [];
  return rules.filter((rule, i) => !own.includes(rule) && rules.indexOf(rule) === i);
}

/**
 * The user's settings with Tierward's hooks merged in and Tierward's deny
 * rules added after the user's own (DEC-73). Allow and ask rules, and every
 * other key, stay as the user wrote them, in the same order; `permissions`
 * is added only when a deny rule has to go somewhere.
 */
export function mergeTierwardSettings(user, tierward, context) {
  const merged = mergeTierwardHooks(user, tierward, context);
  const added = addedDenyRules(user, tierward);
  if (added.length === 0) return merged;
  const permissions =
    user.permissions && typeof user.permissions === 'object' && !Array.isArray(user.permissions)
      ? user.permissions
      : {};
  const deny = [...(Array.isArray(permissions.deny) ? permissions.deny : []), ...added];
  const withDeny =
    'deny' in permissions
      ? Object.fromEntries(
          Object.entries(permissions).map(([key, value]) => [key, key === 'deny' ? deny : value]),
        )
      : { ...permissions, deny };
  if (!('permissions' in merged)) return { ...merged, permissions: withDeny };
  return Object.fromEntries(
    Object.entries(merged).map(([key, value]) => [key, key === 'permissions' ? withDeny : value]),
  );
}

/**
 * The user's own hook groups on the events Tierward also hooks, as
 * `{ event, commands }`. An inline hook an earlier Tierward version wrote is not
 * recognised (DEC-60 f), so a duplicate would show up here.
 */
export function keptUserHooks(user, tierward, context) {
  const userHooks = user.hooks && typeof user.hooks === 'object' ? user.hooks : {};
  const kept = [];
  for (const event of Object.keys(tierward.hooks || {})) {
    for (const group of Array.isArray(userHooks[event]) ? userHooks[event] : []) {
      if (isTierwardHookGroup(group, context)) continue;
      const commands = (Array.isArray(group?.hooks) ? group.hooks : [])
        .map((hook) => hook?.command)
        .filter((command) => typeof command === 'string');
      kept.push({ event, commands });
    }
  }
  return kept;
}

/**
 * The project's settings.json before the scaffold runs, as `{ raw, backup }`:
 * the file's bytes and the timestamped backup written here, before anything
 * else touches the file. An earlier backup is never overwritten: a second
 * init in the same second gets a numbered name. `null` when the project has
 * none.
 */
export async function backupUserSettings(settingsPath, now = new Date()) {
  if (!(await fs.pathExists(settingsPath))) return null;
  const raw = await fs.readFile(settingsPath, 'utf8');
  const stamped = backupPath(settingsPath, now);
  let backup = stamped;
  for (let n = 1; await fs.pathExists(backup); n += 1) backup = `${stamped}-${n}`;
  await fs.writeFile(backup, raw);
  return { raw, backup };
}

/**
 * Write the user's settings back with Tierward's hooks merged in and its deny
 * rules added. `user` is what backupUserSettings returned before the scaffold
 * ran: the file's bytes and the path of its backup. A file that is not valid
 * JSON is put back as it was and left without Tierward's hooks or rules. Lists
 * the deny rules added and the user's hooks kept on the events Tierward hooks.
 * Returns `{ backup, keptHooks, addedDeny }`, or `null` when nothing was merged.
 */
export async function keepUserSettings(settingsPath, { raw, backup }, tierward, context) {
  let user;
  try {
    user = JSON.parse(raw);
    if (!user || typeof user !== 'object' || Array.isArray(user)) {
      throw new Error('the top level is not an object');
    }
  } catch (err) {
    await fs.writeFile(settingsPath, raw);
    console.warn(
      `[tierward] Warning: ${settingsPath} is not valid JSON (${err.message}). ` +
        `It was put back as it was and Tierward's hooks were not added: ` +
        `fix the file and run init again. Your original file: ${backup}`,
    );
    return null;
  }

  const merged = mergeTierwardSettings(user, tierward, context);
  await fs.writeFile(settingsPath, JSON.stringify(merged, null, 2) + '\n');

  const addedDeny = addedDenyRules(user, tierward);
  if (addedDeny.length > 0) {
    console.log(
      [
        `[tierward] ${settingsPath}: ${addedDeny.length} deny rules added after yours ` +
          `(Tierward writes no allow or ask rule and changes none of yours):`,
        ...addedDeny.map((rule) => `  ${rule}`),
        `  Your original file: ${backup}`,
      ].join('\n'),
    );
  }

  const keptHooks = keptUserHooks(user, tierward, context);
  if (keptHooks.length > 0) {
    console.log(
      [
        `[tierward] ${settingsPath}: your hooks below stay next to Tierward's on the same events.`,
        ...keptHooks.map(({ event, commands }) => `  ${event}: ${commands.join(' ; ')}`),
        '  If one of them was written by an earlier Tierward version, remove it: Tierward',
        `  does not recognise its old inline hooks. Your original file: ${backup}`,
      ].join('\n'),
    );
  }
  return { backup, keptHooks, addedDeny };
}
