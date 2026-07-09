#!/usr/bin/env node
// Governance enforcement gate (Tierward v1.34+).
// Wired as a `PreToolUse` hook on the `Bash` matcher. Blocks `git commit` when the
// active block's requirements have not been approved by the human (see
// tierward-capture-approval.mjs, which records approval from the human's prompt).
// Also blocks `git push` toward a protected branch (staging/main) unless the human
// authorized the promotion with a bare `Promote` — a one-shot flag consumed per push,
// so no promotion is ever automatic and no prior execution keyword covers it.
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

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const SESSION_DIR = path.join(PROJECT_DIR, '.claude', 'session');

// Matches `git ... commit` as a subcommand: `git` then optional flags/values
// ending in whitespace, then `commit` followed by whitespace or end-of-string.
// Catches `git commit`, `git commit -m x`, `git -c k=v commit`; rejects
// `git commit-tree`/`commit-graph` (commit followed by `-`) and `git log
// --grep=commit` (commit not space-preceded as a subcommand).
const GIT_COMMIT_RE = /\bgit\s+([^\n]*\s)?commit(\s|$)/;

// Promotion detection: a `git push` in a command that names a protected branch
// (`staging` or `main`) as a standalone token (space- or colon-preceded, so
// `feature/main-nav` never matches). The pipeline's promotion commands are
// compound (`git checkout staging && git merge … && git push origin staging`),
// so testing the whole command string is deliberate. Known limitation: a bare
// `git push` while checked out on a protected branch is not detected — the
// pipeline's prose gate ("promotion is never automatic") still covers it.
const GIT_PUSH_RE = /\bgit\s+([^\n]*\s)?push(\s|$)/;
const PROTECTED_REF_RE = /(^|[\s:'"])(staging|main)(?=$|[\s:'".])/;

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
    (f) => (f.startsWith('block-') || f.startsWith('fix-')) && f.endsWith('.md'),
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

// Read `promotion_approved` from the session file's front matter.
function promotionApproved(file) {
  const fm = readFileSync(file, 'utf8').match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return false;
  const m = fm[1].match(/^promotion_approved:\s*(.+)$/m);
  return !!m && m[1].trim() === 'true';
}

// Consume the promotion flag (one-shot): each push to a protected branch needs
// a fresh bare `Promote` from the human. Consumed BEFORE allowing, so a failed
// push errs on the safe side (re-authorize to retry).
function consumePromotionApproval(file) {
  const content = readFileSync(file, 'utf8');
  writeFileSync(
    file,
    content.replace(/^promotion_approved:\s*true\s*$/m, 'promotion_approved: false'),
  );
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

    // Promotion gate first (stricter): a push naming a protected branch.
    if (GIT_PUSH_RE.test(command) && PROTECTED_REF_RE.test(command)) {
      const file = activeSessionFile();
      if (!file) process.exit(0); // no active block → gate inactive, allow
      if (!promotionApproved(file)) {
        deny(
          'Promotion to a protected branch (staging/main) requires its own authorization. Present the Promotion authorization gate (why / what runs / next step) and ask the developer to reply with the bare keyword `Promote`. No prior approval or execution keyword covers a promotion push.',
        );
      }
      consumePromotionApproval(file); // one-shot: next push needs a fresh `Promote`
      process.exit(0);
    }

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
