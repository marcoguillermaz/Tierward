/**
 * Auto-derive a factual tier.rationale string from familiarity +
 * teamSize + workScope diagnostic answers. Used by dev-flow so the
 * PM is not forced to write a rationale by hand.
 *
 * Output is intentionally fact-shaped, not justification-shaped:
 *   "Solo developer, bugfix-sized changes (≤3 files)"
 *   "Small team, feature-block work (1-2 week chunks)"
 */
const TEAM_LABEL = Object.freeze({
  solo: 'Solo developer',
  small: 'Small team',
  large: 'Larger team',
});

const SCOPE_LABEL = Object.freeze({
  bugfix: 'bugfix-sized changes (≤3 files)',
  feature: 'feature-block work (1-2 week chunks)',
  complex: 'complex domain changes',
});

export function deriveDevRationale({ familiarity, teamSize, workScope }) {
  if (familiarity === '0') return 'Brand new to Claude Code, exploring';
  const team = TEAM_LABEL[teamSize] ?? 'Team';
  const scope = SCOPE_LABEL[workScope] ?? 'general development work';
  return `${team}, ${scope}`;
}
