import chalk from 'chalk';
import { readTeamSettings, violatesMinTier } from './team-settings.js';

const CHANGING_TIER_URL =
  'https://marcoguillermaz.github.io/Tierward/guide/tiers.html#changing-tier';

// The documented tier switch. In-place init ("Existing project") skips files
// that already exist, so it keeps the old pipeline and settings.
export function tierChangeHint(tier) {
  return [
    `  To change tier: commit, switch to a new branch, run ${chalk.cyan(`tierward init --tier=${tier}`)} and choose "New project".`,
    '  It overwrites the files it generates: restore your own edits from the git diff.',
    `  Steps: ${CHANGING_TIER_URL}`,
  ];
}

export function loadTeamSettingsOrExit(cwd) {
  try {
    return readTeamSettings(cwd);
  } catch (err) {
    console.error(chalk.red(`team-settings.json is invalid: ${err.message}`));
    process.exit(1);
  }
}

export function enforceTeamSettingsTier(cwd, tier, { suggestUpgrade = false } = {}) {
  const settings = loadTeamSettingsOrExit(cwd);
  const required = violatesMinTier(settings, tier);
  if (!required) return;
  console.error(
    chalk.red(`✗ team-settings.json requires minTier=${required}, current tier is ${tier}.`),
  );
  if (suggestUpgrade) {
    for (const line of tierChangeHint(required)) console.error(line);
    console.error('  Then retry.');
  } else {
    console.error(`  Choose tier ${required} or higher, or edit .claude/team-settings.json.`);
  }
  process.exit(1);
}
