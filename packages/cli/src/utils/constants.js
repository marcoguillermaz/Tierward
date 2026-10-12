// Current models, cheapest first (platform.claude.com/docs/en/models/overview)
export const AUDIT_MODELS = [
  { name: 'claude-sonnet-5-5 - faster, lower cost', value: 'claude-sonnet-5-5' },
  { name: 'claude-opus-5-5 - more thorough, higher cost (recommended)', value: 'claude-opus-5-5' },
  { name: 'claude-fable-5-1 - deepest reasoning, highest cost', value: 'claude-fable-5-1' },
];

// ux-audit and visual-audit ran on Opus before the answer was wired (DEC-57)
export const DEFAULT_AUDIT_MODEL = 'claude-opus-5-5';

/**
 * The value a skill's `model:` gets for an audit model choice: the family
 * alias, which Claude Code accepts on every provider (full model names work
 * on the Anthropic API only; code.claude.com/docs/en/model-config). A value
 * outside the three families is written as it is.
 */
export function auditModelAlias(model) {
  const family = /^claude-(sonnet|opus|fable)-/.exec(model || '');
  return family ? family[1] : model;
}

/**
 * Maximum length of a SKILL.md `description:` frontmatter value.
 * Enforced by new-skill wizard + validateSkillMd (Tierward convention).
 */
export const SKILL_DESC_MAX_CHARS = 250;

/**
 * Maximum line count for a SKILL.md body (excluding frontmatter). Anthropic
 * best practice: skills ≤ 500 lines; longer bodies belong in sibling reference
 * files per progressive-disclosure guidance.
 */
export const SKILL_MD_MAX_LINES = 500;

/**
 * Maximum line count for a project CLAUDE.md before Anthropic's adherence
 * guidance breaks down. Enforced by doctor check.
 */
export const CLAUDE_MD_MAX_LINES = 200;

/**
 * Maximum allowed timeout (seconds) for a Stop hook entry.
 * Anthropic hook spec unit is seconds; enforced by doctor check.
 */
export const STOP_HOOK_MAX_TIMEOUT_SEC = 600;
