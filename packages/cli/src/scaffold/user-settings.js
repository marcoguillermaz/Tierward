// A project that already has a `.claude/settings.json` keeps it (DEC-55):
// Tierward writes a timestamped backup, then adds only its own hooks. The
// user's permissions and every other key stay exactly as they were, so an
// `init` never overrides what the user allowed, asked or denied.
//
// Tierward's own hook groups are recognised, so a second `init` or a tier
// change replaces them instead of adding them again: a group is Tierward's
// when it equals a group of a Tierward template rendered for this project, or
// when each of its hooks only runs one of Tierward's hook files. A group the
// user extended with a command of their own is left alone.

import fs from 'fs-extra';
import { backupPath } from '../commands/upgrade.js';

const HOOK_FILE_COMMAND = /^node "\$CLAUDE_PROJECT_DIR\/\.claude\/hooks\/([\w.-]+)"$/;

/**
 * Whether a hook group (one entry of `hooks.<Event>`) belongs to Tierward.
 * `knownGroups`: the groups of every Tierward template rendered for this
 * project; `hookFiles`: the names of Tierward's hook files.
 */
export function isTierwardHookGroup(group, { knownGroups, hookFiles }) {
  const json = JSON.stringify(group);
  if (knownGroups.some((known) => JSON.stringify(known) === json)) return true;
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
 * Tierward template's order, then the events only the user hooks.
 */
export function mergeTierwardHooks(user, tierward, context) {
  const userHooks = user.hooks && typeof user.hooks === 'object' ? user.hooks : {};
  const tierwardHooks = tierward.hooks || {};
  const ownGroups = (event) =>
    (Array.isArray(userHooks[event]) ? userHooks[event] : []).filter(
      (group) => !isTierwardHookGroup(group, context),
    );

  const hooks = {};
  for (const [event, groups] of Object.entries(tierwardHooks)) {
    hooks[event] = [...ownGroups(event), ...groups];
  }
  for (const event of Object.keys(userHooks)) {
    if (event in hooks) continue;
    const own = ownGroups(event);
    if (own.length > 0) hooks[event] = own;
  }

  if (!('hooks' in user)) return { ...user, hooks };
  return Object.fromEntries(
    Object.entries(user).map(([key, value]) => [key, key === 'hooks' ? hooks : value]),
  );
}

/**
 * Write the user's settings back with Tierward's hooks merged in, after a
 * timestamped backup of the user's original bytes. `userRaw` is the file as it
 * was before the scaffold ran. A file that is not valid JSON is restored as it
 * was and left without Tierward's hooks. Returns `{ backup }`, or `null` when
 * nothing was merged.
 */
export async function keepUserSettings(settingsPath, userRaw, tierward, context, now = new Date()) {
  let user;
  try {
    user = JSON.parse(userRaw);
    if (!user || typeof user !== 'object' || Array.isArray(user)) {
      throw new Error('the top level is not an object');
    }
  } catch (err) {
    await fs.writeFile(settingsPath, userRaw);
    console.warn(
      `[tierward] Warning: ${settingsPath} is not valid JSON (${err.message}). ` +
        `It was left as it was and Tierward's hooks were not added: ` +
        `fix the file and run init again.`,
    );
    return null;
  }

  const backup = backupPath(settingsPath, now);
  await fs.writeFile(backup, userRaw);
  const merged = mergeTierwardHooks(user, tierward, context);
  await fs.writeFile(settingsPath, JSON.stringify(merged, null, 2) + '\n');
  return { backup };
}
