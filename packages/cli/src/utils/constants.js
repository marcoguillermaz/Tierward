// Current models, cheapest first (platform.claude.com/docs/en/models/overview)
export const AUDIT_MODELS = [
  { name: 'claude-sonnet-5-5 - faster, lower cost (recommended)', value: 'claude-sonnet-5-5' },
  { name: 'claude-opus-5-5 - more thorough, higher cost', value: 'claude-opus-5-5' },
  { name: 'claude-fable-5-1 - deepest reasoning, highest cost', value: 'claude-fable-5-1' },
];

export const DEFAULT_AUDIT_MODEL = AUDIT_MODELS[0].value;

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
