import fs from 'fs-extra';
import path from 'path';

/**
 * Register a skill in the CLAUDE.md Active Skills section.
 * Shared by add.js and new-skill.js.
 *
 * @param {string} cwd - Project root directory
 * @param {string} skillName - Skill name (e.g. 'custom-deploy' or 'api-design')
 * @param {string} [description] - Optional description appended after the name
 * @returns {{ updated: boolean, reason?: string }}
 */
export function registerSkillInClaudeMd(cwd, skillName, description) {
  const claudePath = path.join(cwd, 'CLAUDE.md');

  // Read directly with try/catch to avoid the existsSync → readFile race
  // CodeQL flags as js/file-system-race.
  let content;
  try {
    content = fs.readFileSync(claudePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { updated: false, reason: 'CLAUDE.md not found' };
    }
    throw err;
  }

  if (!content.includes('## Active Skills')) {
    return { updated: false, reason: 'No Active Skills section in CLAUDE.md' };
  }

  if (content.includes(`/${skillName}`)) {
    return { updated: false, reason: 'Skill already registered' };
  }

  const suffix = description ? ` - ${description}` : '';
  const entry = `- \`/${skillName}\`${suffix}\n`;
  const updated = content.replace(/## Active Skills\n/, `## Active Skills\n${entry}`);
  fs.writeFileSync(claudePath, updated);

  return { updated: true };
}
