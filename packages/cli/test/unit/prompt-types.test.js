/**
 * Prompt-type registration guard.
 *
 * inquirer@14 dropped the `list` type and several others. The interactive
 * wizard was bypassed in all integration tests (--answers flag), so no test
 * caught `type:'list'` being unregistered after the ^8→^14 float. This test
 * loads every prompt-config array from source and asserts each `type` value
 * is registered in the installed inquirer version. It runs in CI (unit suite)
 * and catches the whole class of "unregistered prompt type" errors at commit
 * time, without needing a TTY.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import inquirer from 'inquirer';

const promptModule = inquirer.createPromptModule();
const REGISTERED = new Set(Object.keys(promptModule.prompts || {}));

/**
 * Load and return the prompt arrays from all interactive commands.
 * Each entry: { file, questions: [{type, name, ...}] }
 */
// Reserved for a future TTY-based sweep; grep-based guard below covers all cases.
// eslint-disable-next-line no-unused-vars
async function loadAllPromptConfigs() {
  const configs = [];

  // Every module that calls inquirer.prompt([...]) with a type field.
  // Add new entries here when a new interactive command is created.
  const modules = [
    ['init-greenfield', () => import('../../src/commands/init-greenfield.js')],
    ['init-from-context', () => import('../../src/commands/init-from-context.js')],
    ['init-in-place', () => import('../../src/commands/init-in-place.js')],
    ['new-skill', () => import('../../src/commands/new-skill.js')],
    ['dev-flow', () => import('../../src/context-builder/interview/dev-flow.js')],
    ['pm-flow', () => import('../../src/context-builder/interview/pm-flow.js')],
    ['persona', () => import('../../src/context-builder/persona.js')],
    ['review', () => import('../../src/context-builder/inference/review.js')],
  ];

  for (const [name, loader] of modules) {
    try {
      const mod = await loader();
      // Collect any exported array that looks like a prompt-question array
      // (has objects with a `type` string field).
      for (const [key, value] of Object.entries(mod)) {
        if (Array.isArray(value) && value.length > 0 && typeof value[0]?.type === 'string') {
          configs.push({ file: name, exportName: key, questions: value });
        }
      }
    } catch {
      // Module may not export arrays directly — that's fine; the grep below
      // covers the type strings in the actual source.
    }
  }
  return configs;
}

describe('inquirer prompt types — all registered', () => {
  it('every type used in source is registered in the installed inquirer', async () => {
    // Primary guard: grep the source for all type: 'xxx' strings and verify each.
    // This works even if modules don't export their question arrays.
    const { execSync } = await import('node:child_process');
    const { fileURLToPath } = await import('node:url');
    const { dirname, resolve } = await import('node:path');
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../src');

    const raw = execSync(`grep -roh "type: '[a-z]*'" ${root}`, { encoding: 'utf8' });
    const types = [
      ...new Set(
        raw
          .trim()
          .split('\n')
          .map((l) => l.match(/'([a-z]+)'/)?.[1])
          .filter(Boolean),
      ),
    ];

    // These are data-object type discriminators, not inquirer prompt types — exclude them.
    const NON_PROMPT_TYPES = new Set(['text', 'github', 'local', 'command']);

    const promptTypes = types.filter((t) => !NON_PROMPT_TYPES.has(t));
    const unknown = promptTypes.filter((t) => !REGISTERED.has(t));

    assert.deepEqual(
      unknown,
      [],
      `Unregistered inquirer prompt type(s) found in source: [${unknown.join(', ')}]. ` +
        `Registered types in inquirer@${(await import('inquirer')).default.version ?? 'installed'}: ` +
        `[${[...REGISTERED].join(', ')}]. ` +
        `Rename the type or register it via inquirer.createPromptModule().registerPrompt().`,
    );
  });
});
