#!/usr/bin/env node
// Governance enforcement gate (Tierward v1.34+).
// Wired as a `PreToolUse` hook on the `Bash` matcher. Blocks `git commit` when the
// active block's requirements have not been approved by the human (see
// tierward-capture-approval.mjs, which records approval from the human's prompt).
//
// WHY PreToolUse, not Stop: approval requires Claude to YIELD THE TURN so the human
// can type "Proceed". The Stop hook blocks the turn-yield — gating approval there is
// a deadlock by construction (this is what caused the T-07-gold 11-fires). PreToolUse
// gates the ACTION (the commit), not the turn-yield: a blocked commit lets Claude
// stop-and-ask freely, the human approves, the commit retries and passes. Obtainable,
// not deadlocked.
//
// Scope: mechanical for a COOPERATIVE agent. An adversarial agent can edit
// .claude/settings.json to remove this hook (live reload) — forge-proofing needs
// org-level managed settings (see docs). This raises soft STOP-gate context to a
// human-attested, hook-enforced gate; it is not an adversarial sandbox.
//
// Spec reference: https://code.claude.com/docs/en/hooks
//   - matcher: "Bash"
//   - input: JSON on stdin with tool_name="Bash" and tool_input.command
//   - block: exit 0 with hookSpecificOutput.permissionDecision = "deny" + reason
//   - allow: exit 0 silently (no output)
//
// Fail-open: any error → allow. A misconfigured project never has commits blocked
// spuriously; worst case is the pre-v1.34 status quo (no governance gate).

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const SESSION_DIR = path.join(PROJECT_DIR, '.claude', 'session');

// Matches `git ... commit` as a subcommand: `git` then optional flags/values
// ending in whitespace, then `commit` followed by whitespace or end-of-string.
// Catches `git commit`, `git commit -m x`, `git -c k=v commit`; rejects
// `git commit-tree`/`commit-graph` (commit followed by `-`) and `git log
// --grep=commit` (commit not space-preceded as a subcommand).
const GIT_COMMIT_RE = /\bgit\s+([^\n]*\s)?commit(\s|$)/;

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
  });
}

function activeSessionFile() {
  if (!existsSync(SESSION_DIR)) return null;
  const blocks = readdirSync(SESSION_DIR).filter(
    (f) => f.startsWith('block-') && f.endsWith('.md'),
  );
  if (blocks.length === 0) return null;
  return blocks
    .map((f) => path.join(SESSION_DIR, f))
    .sort((a, b) => mtime(b) - mtime(a))[0];
}

function mtime(p) {
  try {
    return statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

// Read `requirements_approved` from the session file's front matter.
// Returns true only if explicitly `true`; absent/false/no-file → false.
function requirementsApproved(file) {
  const fm = readFileSync(file, 'utf8').match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return false;
  const m = fm[1].match(/^requirements_approved:\s*(.+)$/m);
  return !!m && m[1].trim() === 'true';
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
    }),
  );
  process.exit(0);
}

async function main() {
  try {
    const raw = await readStdin();
    if (!raw.trim()) process.exit(0);
    const payload = JSON.parse(raw);
    const command = payload?.tool_input?.command || '';
    if (!GIT_COMMIT_RE.test(command)) process.exit(0); // not a commit → allow

    const file = activeSessionFile();
    if (!file) process.exit(0); // no active block → governance gate inactive, allow

    if (!requirementsApproved(file)) {
      deny(
        'Requirements not yet approved for this block. Confirm scope with an execution keyword (Execute / Proceed / Confirmed / Go ahead) before committing.',
      );
    }
  } catch {
    // fall open
  }
  process.exit(0);
}

main();
