import chalk from 'chalk';
import { readTeamSettings, violatesMinTier } from './team-settings.js';

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
    console.error(
      `  Promote first: ${chalk.cyan(`tierward init --tier=${required}`)} (choose "Existing project"), then retry.`,
    );
  } else {
    console.error(`  Choose tier ${required} or higher, or edit .claude/team-settings.json.`);
  }
  process.exit(1);
}
