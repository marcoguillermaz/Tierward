#!/usr/bin/env node
// File-list scope guard (Tierward v1.35+).
// Wired as a `PreToolUse` hook on the `Write|Edit` matcher. Blocks a Write/Edit to a
// file that is NOT in the active block's approved Phase-1 scope (`files_in_scope` in the
// session front matter). Mechanizes the prose "No unrequested changes" rule.
//
// Self-arming: inactive until Phase 1 persists `files_in_scope` to the session file.
// Absent/empty list, no active block, or any error → allow (fail-open): a project that
// never populates the list is never blocked; worst case is the prose-only status quo.
//
// Exclusion set (always allowed, never compared against the list): process/meta files a
// block legitimately edits outside its source scope, especially at Phase 8 closure —
//   - `.claude/**`  (session file, hooks, settings, rules)
//   - `docs/**`     (checklist, requirements, ADRs, backlog, phase-log, specs)
//   - repo-root meta (`README*`, `CHANGELOG*`, any root-level `*.md`)
// TRADEOFF: source that lives under `docs/` or at the repo root is unguarded. This keeps
// the false-block rate near zero (closure edits never trip it) at the cost of not
// catching scope-creep into those locations. Widen `excluded()` if that matters for a
// given project.
//
// Scope: mechanical for a COOPERATIVE agent (same model as tierward-governance-gate) —
// an adversarial agent can edit settings.json to remove the hook. This raises the soft
// "No unrequested changes" rule to a hook-enforced ask-gate, not an adversarial sandbox.
//
// Spec reference: https://code.claude.com/docs/en/hooks
//   - matcher: "Write|Edit"
//   - input: JSON on stdin with tool_input.file_path
//   - block: exit 0 with hookSpecificOutput.permissionDecision = "deny" + reason
//   - allow: exit 0 silently (no output)
//
// Path normalization is repo-relative to CLAUDE_PROJECT_DIR and MUST match the form
// Phase 1 writes into `files_in_scope` (repo-relative, POSIX separators, no leading ./).

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const SESSION_DIR = path.join(PROJECT_DIR, '.claude', 'session');

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
  });
}

function mtime(p) {
  try {
    return statSync(p).mtimeMs;
  } catch {
    return 0;
  }
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

// Repo-relative POSIX path. Must produce the same form Phase 1 writes into the list.
function repoRel(fp) {
  const abs = path.isAbsolute(fp) ? fp : path.join(PROJECT_DIR, fp);
  return path.relative(PROJECT_DIR, abs).split(path.sep).join('/');
}

// Files always allowed regardless of the approved list (see header).
function excluded(rel) {
  if (rel.startsWith('.claude/')) return true;
  if (rel.startsWith('docs/')) return true;
  if (!rel.includes('/')) {
    // repo-root files only
    if (/^(README|CHANGELOG)/i.test(rel)) return true;
    if (/\.md$/i.test(rel)) return true;
  }
  return false;
}

// Parse the `files_in_scope:` YAML block list from the session front matter.
// Entries are normalized to repo-relative POSIX (matching repoRel).
function filesInScope(file) {
  const fm = readFileSync(file, 'utf8').match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return [];
  const blk = fm[1].match(/^files_in_scope:\s*\n((?:[ \t]*-[ \t].*\n?)+)/m);
  if (!blk) return [];
  return blk[1]
    .split('\n')
    .map((l) => l.match(/^[ \t]*-[ \t]+(.*\S)\s*$/))
    .filter(Boolean)
    .map((m) => m[1].trim().replace(/^["']|["']$/g, ''))
    .map((p) => p.replace(/^\.\//, '').split(path.sep).join('/'));
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

async function main() {
  try {
    const raw = await readStdin();
    if (!raw.trim()) process.exit(0);
    const payload = JSON.parse(raw);
    const fp = payload?.tool_input?.file_path || '';
    if (!fp) process.exit(0); // no path → allow

    const file = activeSessionFile();
    if (!file) process.exit(0); // no active block → guard inactive

    const scope = filesInScope(file);
    if (scope.length === 0) process.exit(0); // self-arming: list not populated → allow

    const rel = repoRel(fp);
    if (rel.startsWith('../')) process.exit(0); // outside the project → not ours to guard
    if (excluded(rel)) process.exit(0); // process/meta file → allow
    if (scope.includes(rel)) process.exit(0); // in approved scope → allow

    deny(
      `Edit to "${rel}" is outside the approved Phase-1 scope (files_in_scope in the session file). ` +
        `If this file genuinely needs changing, confirm with the user, add it to files_in_scope, then retry.`,
    );
  } catch {
    // fall open
  }
  process.exit(0);
}

main();
