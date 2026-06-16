// Bridges skill invocation to Claude Code via its official URI handler. Claude
// Code owns the agent loop — the extension only opens a CC tab with the slash
// command pre-filled (NOT auto-submitted; the user reviews and presses Enter).
// Slash commands cannot be passed on the `claude` CLI, and CC exposes no public
// command API, so the documented `vscode://anthropic.claude-code/open` URI is
// the supported trigger.

const CC_OPEN_URI = 'vscode://anthropic.claude-code/open';

/** Builds the Claude Code URI that opens a tab with `prompt` pre-filled. */
export function buildCcUri(prompt: string): string {
  return `${CC_OPEN_URI}?prompt=${encodeURIComponent(prompt)}`;
}

/** The slash-command form that runs a skill once submitted in Claude Code. */
export function skillPrompt(skillName: string): string {
  return `/${skillName}`;
}

export interface SkillHeader {
  name: string | null;
  /** True only when the frontmatter declares `user-invocable: true`. */
  userInvocable: boolean;
}

/**
 * Reads `name` and `user-invocable` from a SKILL.md frontmatter block. Pure (no
 * `vscode`) so the codelens gating is unit-testable. Skills that don't declare
 * `user-invocable: true` are not offered for invocation.
 */
export function parseSkillHeader(text: string): SkillHeader {
  const header: SkillHeader = { name: null, userInvocable: false };
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return header;
  }
  for (const line of match[1].split('\n')) {
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) {
      continue;
    }
    if (pair[1] === 'name') {
      header.name = pair[2].trim();
    } else if (pair[1] === 'user-invocable') {
      header.userInvocable = pair[2].trim() === 'true';
    }
  }
  return header;
}
