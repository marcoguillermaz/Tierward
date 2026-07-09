/**
 * Skill Registry - single source of truth for skill applicability rules.
 *
 * Consumed by:
 *   - pruneSkills()          in scaffold/index.js   (which dirs to delete)
 *   - pruneCheatsheet()      in scaffold/index.js   (which rows to remove)
 *   - injectActiveSkills()   in generators/claude-md.js (which skills to list)
 *
 * Adding a new skill = one entry here. No other file needs conditional logic.
 */

export const NATIVE_STACKS = ['swift', 'kotlin', 'rust', 'dotnet', 'java'];

/**
 * Remote-governance profile switch.
 * When false, the scaffold strips every staging-branch reference from the
 * payload (pipelines, hooks, rules, skills, config): the project promotes
 * work branches directly to `main` behind the same Promotion gates.
 * Derived, not asked in the wizard: native stacks have no staging server.
 */
export function remoteGovernanceEnabled(config) {
  return !NATIVE_STACKS.includes(config.techStack);
}

/**
 * Web-oriented stacks that typically carry a frontend bundle and a sitemap.
 * Used for placeholder substitution and wizard branching — pair with
 * NATIVE_STACKS for the complete tech-stack vocabulary.
 */
export const WEB_STACKS = ['node-ts', 'node-js', 'python', 'ruby'];

/**
 * @typedef {Object} SkillEntry
 * @property {string}  name           - Skill directory name (matches SKILL.md parent folder)
 * @property {string}  minTier        - Lowest tier that includes this skill: 's', 'm', or 'l'
 * @property {Object}  requires       - Feature flags that must NOT be false. Empty = always installed.
 * @property {boolean} [excludeNative] - If true, skill is removed for native stacks even when flags pass
 * @property {boolean} cheatsheet     - Whether the skill appears in cheatsheet.md
 */

/** @type {SkillEntry[]} */
export const SKILL_REGISTRY = [
  { name: 'arch-audit', minTier: 's', requires: {}, cheatsheet: false },
  { name: 'commit', minTier: 's', requires: {}, cheatsheet: false },
  { name: 'simplify', minTier: 's', requires: {}, cheatsheet: true },
  { name: 'skill-dev', minTier: 's', requires: {}, cheatsheet: true },
  { name: 'perf-audit', minTier: 's', requires: {}, cheatsheet: true },
  { name: 'security-audit', minTier: 's', requires: {}, cheatsheet: true },
  { name: 'skill-security', minTier: 's', requires: {}, cheatsheet: true },
  { name: 'systematic-debugging', minTier: 's', requires: {}, cheatsheet: true },
  { name: 'api-design', minTier: 'm', requires: { hasApi: true }, cheatsheet: true },
  { name: 'skill-db', minTier: 'm', requires: { hasDatabase: true }, cheatsheet: true },
  { name: 'migration-audit', minTier: 'm', requires: { hasDatabase: true }, cheatsheet: true },
  {
    name: 'responsive-audit',
    minTier: 'm',
    requires: { hasFrontend: true },
    excludeNative: true,
    cheatsheet: true,
  },
  {
    name: 'visual-audit',
    minTier: 'm',
    requires: { hasFrontend: true },
    excludeNative: true,
    cheatsheet: true,
  },
  {
    name: 'ux-audit',
    minTier: 'm',
    requires: { hasFrontend: true },
    excludeNative: true,
    cheatsheet: true,
  },
  {
    name: 'ui-audit',
    minTier: 'm',
    requires: { hasFrontend: true, hasDesignSystem: true },
    cheatsheet: true,
  },
  {
    name: 'accessibility-audit',
    minTier: 'm',
    requires: { hasFrontend: true },
    excludeNative: true,
    cheatsheet: true,
  },
  { name: 'test-audit', minTier: 'm', requires: {}, cheatsheet: true },
  { name: 'doc-audit', minTier: 'm', requires: {}, cheatsheet: true },
  { name: 'api-contract-audit', minTier: 'm', requires: { hasApi: true }, cheatsheet: true },
  { name: 'infra-audit', minTier: 'm', requires: {}, cheatsheet: true },
  { name: 'compliance-audit', minTier: 'm', requires: {}, cheatsheet: true },
  { name: 'dependency-audit', minTier: 'm', requires: {}, cheatsheet: true },
  { name: 'pr-review', minTier: 'm', requires: {}, cheatsheet: true },
  { name: 'dependency-scan', minTier: 'm', requires: {}, cheatsheet: false },
  { name: 'context-review', minTier: 'l', requires: {}, cheatsheet: false },
  { name: 'skill-review', minTier: 'm', requires: {}, cheatsheet: false },
];

const TIER_ORDER = { s: 0, m: 1, l: 2 };

/**
 * Check whether a skill is active for the given config.
 * A feature flag must be explicitly `false` to disable - undefined/true both pass.
 */
function isSkillActive(skill, config) {
  for (const flag of Object.keys(skill.requires)) {
    if (config[flag] === false) return false;
  }
  if (skill.excludeNative && NATIVE_STACKS.includes(config.techStack)) return false;
  return true;
}

/**
 * Skills to remove from disk after template copy.
 * Used by pruneSkills() - does NOT filter by tier (the template already contains
 * only the skills for its tier).
 */
export function getSkillsToRemove(config) {
  return SKILL_REGISTRY.filter((s) => !isSkillActive(s, config)).map((s) => s.name);
}

/**
 * Skills that should appear in the Active Skills section of CLAUDE.md.
 * Filters by tier AND feature flags.
 */
export function getActiveSkills(config) {
  const tierLevel = TIER_ORDER[(config.tier || 's').toLowerCase()] ?? 0;
  return SKILL_REGISTRY.filter(
    (s) => TIER_ORDER[s.minTier] <= tierLevel && isSkillActive(s, config),
  ).map((s) => s.name);
}

/**
 * Cheatsheet-listed skills that should be removed (feature flag inactive).
 * Used by pruneCheatsheet().
 */
export function getCheatsheetSkillsToRemove(config) {
  return SKILL_REGISTRY.filter((s) => s.cheatsheet && !isSkillActive(s, config)).map((s) => s.name);
}
