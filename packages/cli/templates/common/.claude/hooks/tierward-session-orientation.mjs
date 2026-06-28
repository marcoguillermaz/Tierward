#!/usr/bin/env node
// Session orientation hook (Tierward v1.35+).
// Wired as a `SessionStart` hook (tier M/L). Emits a one-line Tierward state banner
// to stdout at session open.
//
// WHY: the old SessionStart hook was a deficit-default — it nagged "arch audit
// overdue" on every session, including brand-new projects that have never had a
// block to audit. The diagnostic's "progetto silente" complaint is the cold-open:
// you open Claude and see nothing about where Tierward thinks you are. This hook
// replaces the nag with an active-state orientation read from the project itself.
//
// MECHANISM: plain stdout from a SessionStart hook is BOTH shown to the developer
// (a visible banner, as the previous arch-audit nag was) AND injected into the
// model's context for the first turn (verified on Claude Code v2.1.195 via probe).
// So a single plain line serves two halves: it answers the felt silence for the
// human, and primes the model with Tierward state it cannot infer (active block,
// requirements_approved, branch→pipeline). The cleanroom showed the model orients
// fine ON a prompt — this is state injection, not teaching it to orient.
//
// The arch-audit nag is NOT removed, only gated: it now fires only once at least
// one block has completed (a real Log row in docs/implementation-checklist.md),
// so a fresh project is never nagged about an audit it cannot need.
//
// Scope: tier M/L only (they have rules/pipeline.md + .claude/session/). Tier S
// (Fast Lane, no block files) gets a thinner variant in a later increment; tier 0
// has no SessionStart hook by design.
//
// Spec reference: https://code.claude.com/docs/en/hooks
//   - event: SessionStart; input JSON on stdin carries `source`
//     (startup | resume | clear | compact)
//   - `compact` is skipped: the PostCompact hook owns post-/compact restoration,
//     so re-emitting here would double-inject.
//
// Fail-open: any error → exit 0 with no output, so a misconfigured project never
// has its session start blocked or polluted by this hook.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const SESSION_DIR = path.join(PROJECT_DIR, '.claude', 'session');
const SEVEN_DAYS = 604800; // seconds

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
  });
}

// Tier from the pipeline.md heading — the one reliable runtime marker.
// "Fast Lane Pipeline" → S · "… - Tier M" → M · "… - Tier L" → L.
function detectTier() {
  const p = path.join(PROJECT_DIR, '.claude', 'rules', 'pipeline.md');
  if (!existsSync(p)) return null;
  let head = '';
  try {
    head = (readFileSync(p, 'utf8').split('\n')[0] || '');
  } catch {
    return null;
  }
  if (/Fast Lane/i.test(head)) return 'S';
  if (/Tier\s*M/i.test(head)) return 'M';
  if (/Tier\s*L/i.test(head)) return 'L';
  return null;
}

function statMtime(p) {
  try {
    return statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

// Active block session file (block-*.md). Most-recently-modified wins if several.
function activeSessionFile() {
  if (!existsSync(SESSION_DIR)) return null;
  let blocks;
  try {
    blocks = readdirSync(SESSION_DIR).filter(
      (f) => f.startsWith('block-') && f.endsWith('.md'),
    );
  } catch {
    return null;
  }
  if (blocks.length === 0) return null;
  return blocks
    .map((f) => path.join(SESSION_DIR, f))
    .sort((a, b) => statMtime(b) - statMtime(a))[0];
}

// Parse the block name + approval flag from the session file front matter.
function readBlockState() {
  const file = activeSessionFile();
  if (!file) return null;
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  const fmText = fm ? fm[1] : '';
  const blockM = fmText.match(/^block:\s*(.+)$/m);
  const apprM = fmText.match(/^requirements_approved:\s*(.+)$/m);
  const name = blockM
    ? blockM[1].trim()
    : path.basename(file).replace(/^block-/, '').replace(/\.md$/, '');
  return {
    name,
    approved: apprM ? /true/i.test(apprM[1]) : false,
    isNew: name === 'new-session',
  };
}

// Current branch via .git/HEAD (no git spawn). null on detached / no-git / worktree.
function gitBranch() {
  try {
    const head = readFileSync(path.join(PROJECT_DIR, '.git', 'HEAD'), 'utf8').trim();
    const m = head.match(/^ref:\s*refs\/heads\/(.+)$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// Greenfield discovery still pending?
function discoveryPending() {
  for (const name of ['CONTEXT_IMPORT.md', 'CONTEXT_IMPORT_GREENFIELD.md']) {
    const p = path.join(PROJECT_DIR, name);
    if (!existsSync(p)) continue;
    try {
      if (/Status[^\n]*PENDING_DISCOVERY/i.test(readFileSync(p, 'utf8'))) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

// Completed blocks = Log rows with a real YYYY-MM-DD date (not the placeholder).
function completedBlockCount() {
  const p = path.join(PROJECT_DIR, 'docs', 'implementation-checklist.md');
  if (!existsSync(p)) return 0;
  let content;
  try {
    content = readFileSync(p, 'utf8');
  } catch {
    return 0;
  }
  let count = 0;
  for (const line of content.split('\n')) {
    if (/^\|\s*\d{4}-\d{2}-\d{2}\s*\|/.test(line)) count++;
  }
  return count;
}

function archAudit() {
  let last = 0;
  try {
    last = parseInt(
      readFileSync(path.join(SESSION_DIR, 'last-arch-audit'), 'utf8').trim(),
      10,
    ) || 0;
  } catch {
    last = 0;
  }
  const now = Math.floor(Date.now() / 1000);
  return {
    overdue: now - last > SEVEN_DAYS,
    lastLabel: last === 0 ? 'never' : new Date(last * 1000).toISOString().slice(0, 10),
  };
}

async function main() {
  try {
    const raw = await readStdin();
    let source = 'startup';
    try {
      source = JSON.parse(raw).source || 'startup';
    } catch {
      // no/!JSON stdin → treat as startup
    }
    if (source === 'compact') process.exit(0); // PostCompact owns this

    const tier = detectTier();
    if (!tier) process.exit(0); // not a piped tier → nothing to orient

    const block = readBlockState();
    const discovery = discoveryPending();
    const completed = completedBlockCount();
    const branch = gitBranch();

    const parts = [`🧭 Tierward tier-${tier}`];
    if (discovery) {
      parts.push('discovery pending');
    }
    if (block && !block.isNew) {
      parts.push(
        `active block: ${block.name} (${block.approved ? 'requirements approved' : 'requirements not yet approved'})`,
      );
    } else if (block && block.isNew) {
      parts.push('session in progress (block unnamed, Phase 0)');
    } else if (!discovery) {
      parts.push(
        completed > 0
          ? `${completed} block${completed === 1 ? '' : 's'} completed, no active block`
          : 'no active block yet',
      );
    }
    if (branch && branch !== 'main' && branch !== 'staging') {
      parts.push(`branch ${branch}`);
    }

    let hint;
    if (discovery) hint = 'Phase 0: run the CONTEXT_IMPORT.md discovery before any other work.';
    else if (block && !block.isNew) {
      hint = block.approved
        ? 'Resume from the session file.'
        : 'Define and approve requirements at the Phase 1 STOP gate.';
    } else hint = 'Start a block: open a feature/ branch and run Phase 0.';

    let banner = `${parts.join(' · ')} — ${hint}`;

    // Nag only once a block has actually completed (was deficit-default pre-A-2).
    if (completed >= 1) {
      const { overdue, lastLabel } = archAudit();
      if (overdue) {
        banner += `\n⚠️  Arch audit overdue (last: ${lastLabel}) — run /arch-audit to check compliance.`;
      }
    }

    console.log(banner);
  } catch {
    // fail-open: never block or pollute session start
  }
  process.exit(0);
}

main();
