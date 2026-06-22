#!/usr/bin/env node
// team-settings runtime enforcement hook (Tierward v1.21+).
// Wired as a `PreToolUse` hook on the `Skill` matcher. Reads `.claude/team-settings.json`
// from the project and refuses skill invocations that violate `blockedSkills` or
// `allowedSkills`. Falls open silently on any error so a misconfigured project never
// loses access to all skills — the worst case is the v1.16-1.20 status quo
// (CLI-side enforcement only).
//
// Spec reference: https://code.claude.com/docs/en/hooks
//   - matcher: "Skill"
//   - input: JSON on stdin with tool_name="Skill" and tool_input.skill_name
//   - block: exit 0 with hookSpecificOutput.permissionDecision = "deny" + reason
//   - allow: exit 0 silently (no output)

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const SETTINGS_PATH = path.join(PROJECT_DIR, '.claude', 'team-settings.json');

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function denyReply(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
}

function extractSkillName(payload) {
  const ti = payload?.tool_input;
  if (!ti) return null;
  return ti.skill_name || ti.skill || ti.name || null;
}

async function main() {
  const stdin = await readStdin();
  if (!stdin || !stdin.trim()) {
    process.exit(0); // empty input → allow
  }

  let payload;
  try {
    payload = JSON.parse(stdin);
  } catch {
    process.exit(0); // malformed input → fail-open
  }

  if (payload.tool_name !== 'Skill') {
    process.exit(0); // not a skill invocation → don't interfere
  }

  const skillName = extractSkillName(payload);
  if (!skillName) {
    process.exit(0); // can't determine skill name → fail-open
  }

  if (!existsSync(SETTINGS_PATH)) {
    process.exit(0); // no team-settings.json → unrestricted (v1.16+ semantics)
  }

  let settings;
  try {
    settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'));
  } catch {
    // malformed settings → fail-open. The Tierward doctor check on team-settings-compliance
    // will surface the parse error in interactive runs.
    process.exit(0);
  }

  // blockedSkills: hard deny (custom-* is NOT exempt; matches v1.16 CLI semantics).
  if (Array.isArray(settings.blockedSkills) && settings.blockedSkills.includes(skillName)) {
    process.stdout.write(
      JSON.stringify(
        denyReply(
          `Skill "${skillName}" is blocked by .claude/team-settings.json (blockedSkills). Edit the file or use a different skill.`,
        ),
      ),
    );
    process.exit(0);
  }

  // allowedSkills: whitelist deny (custom-* IS exempt; matches v1.16 CLI semantics).
  if (Array.isArray(settings.allowedSkills) && settings.allowedSkills.length > 0) {
    if (!skillName.startsWith('custom-') && !settings.allowedSkills.includes(skillName)) {
      process.stdout.write(
        JSON.stringify(
          denyReply(
            `Skill "${skillName}" is not in the allowedSkills list of .claude/team-settings.json. Allowed: ${settings.allowedSkills.join(', ')}. Custom skills (custom-*) bypass this check.`,
          ),
        ),
      );
      process.exit(0);
    }
  }

  // Default: allow.
  process.exit(0);
}

main().catch((err) => {
  // Any unexpected error → fail-open. Never block the user because the hook itself failed.
  process.stderr.write(`team-settings hook error (failing open): ${err.message}\n`);
  process.exit(0);
});
