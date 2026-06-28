#!/usr/bin/env node
// Governance approval capture hook (Tierward v1.34+).
// Wired as a `UserPromptSubmit` hook. Reads the human's raw prompt from stdin and,
// when it begins with an execution keyword (Execute / Proceed / Confirmed / Go ahead),
// records approval into the active session file's machine-readable front matter
// (`requirements_approved: true`).
//
// WHY: the Phase 1 STOP gate was soft context — Claude could narrate past it and
// self-assert approval. This hook makes the approval signal originate from the
// HUMAN's prompt, outside Claude's write path, so the governance gate
// (tierward-governance-gate.mjs, PreToolUse) keys off something Claude did not author.
//
// Scope honesty: this is mechanical for a COOPERATIVE agent. It is NOT forge-proof
// against an adversarial agent that edits .claude/settings.json to remove the hook —
// that requires org-level managed settings (see docs). The capture itself is hard;
// the enforcement's removability is a positioning matter, not a capture flaw.
//
// Spec reference: https://code.claude.com/docs/en/hooks
//   - event: UserPromptSubmit, runs BEFORE the model sees the prompt
//   - input: JSON on stdin; the human's text is the `prompt` field (verified payload)
//   - this hook never blocks: it always exits 0 (capture is a side effect)
//
// Fail-open: any error → exit 0 with no change, so a misconfigured project never
// has its prompts blocked by this hook.

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const SESSION_DIR = path.join(PROJECT_DIR, '.claude', 'session');

// Execution keywords that authorize advancing past a STOP gate. Matched only as a
// BARE reply — the trimmed prompt must BE the keyword (plus optional trailing
// punctuation), not the keyword followed by other words. This is deliberately
// strict: "Proceed with the refactor" or "Proceed to the next file" are casual
// imperatives, not scope approvals, and must NOT arm the governance gate. For a
// governance signal, false-arming is worse than asking the developer to retype the
// bare keyword. pipeline.md instructs the developer to reply with the keyword alone.
//
// i18n gap (increment 2): keywords are English, matching pipeline.md's declared
// execution keywords. An Italian developer replying "Procedi" will NOT arm approval
// and the commit gate will block — document the binding; localize the keyword set
// (and pipeline.md) in a later increment.
const APPROVAL_RE = /^(execute|proceed|confirmed|go ahead)\s*[.!]*\s*$/i;

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
  });
}

// Find the active block session file (block-*.md). Returns the path or null.
function activeSessionFile() {
  if (!existsSync(SESSION_DIR)) return null;
  const blocks = readdirSync(SESSION_DIR).filter(
    (f) => f.startsWith('block-') && f.endsWith('.md'),
  );
  if (blocks.length === 0) return null;
  // Most-recently-modified wins if several exist (resumed/interrupted sessions).
  return blocks
    .map((f) => path.join(SESSION_DIR, f))
    .sort((a, b) => statMtime(b) - statMtime(a))[0];
}

function statMtime(p) {
  try {
    return statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

// Set `requirements_approved: true` in the YAML front matter. If the file has no
// front matter, prepend one. Idempotent.
function recordApproval(file) {
  const content = readFileSync(file, 'utf8');
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fmMatch) {
    const body = content.slice(fmMatch[0].length);
    let fm = fmMatch[1];
    if (/^requirements_approved:/m.test(fm)) {
      fm = fm.replace(/^requirements_approved:.*$/m, 'requirements_approved: true');
    } else {
      fm += '\nrequirements_approved: true';
    }
    writeFileSync(file, `---\n${fm}\n---\n${body}`);
  } else {
    writeFileSync(file, `---\nrequirements_approved: true\n---\n${content}`);
  }
}

async function main() {
  try {
    const raw = await readStdin();
    if (!raw.trim()) process.exit(0);
    const prompt = (JSON.parse(raw).prompt || '').trim();
    if (!APPROVAL_RE.test(prompt)) process.exit(0);
    const file = activeSessionFile();
    if (file) recordApproval(file);
  } catch {
    // fall open
  }
  process.exit(0);
}

main();
