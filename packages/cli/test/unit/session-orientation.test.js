// Regression suite for the A-2 session orientation hook (Tierward v1.35+).
//
// tierward-session-orientation.mjs is a SessionStart hook (tier M/L). It emits a
// one-line Tierward state banner to stdout — which is BOTH shown to the developer
// and injected into the model's first-turn context (verified on Claude Code
// v2.1.195). It replaces the old deficit-default arch-audit nag: orientation reads
// active state from the project, and the arch-audit reminder now fires only after
// at least one block has completed.
//
// These tests verify the banner composition and gating logic in isolation. The
// felt-experience acceptance (banner visible at cold-open + first response is
// state-aware) is validated separately in a cleanroom run, not here — green unit
// tests do not prove the felt fix, the campaign's own lesson.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(
  __dirname,
  '../../templates/common/.claude/hooks/tierward-session-orientation.mjs',
);

const PIPELINE = {
  S: '# Fast Lane Pipeline\n',
  M: '# Standard Development Pipeline - Tier M\n',
  L: '# Full Development Pipeline - Tier L\n',
};

// Create an isolated project dir populated with the given { relpath: content } map.
function setup(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-orient-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

// Run the hook with the given stdin payload; return trimmed stdout.
function run(dir, stdinObj = { source: 'startup' }) {
  return execFileSync('node', [SCRIPT], {
    input: JSON.stringify(stdinObj),
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    encoding: 'utf8',
  }).trim();
}

// A tier-M project with N completed blocks in the Log table.
function checklistWith(completedDates) {
  const rows = completedDates.map((d) => `| ${d} | block-${d} | 3 | 5/5 | - |`).join('\n');
  return `# Implementation Checklist\n\n## Log\n\n| Date | Block | Files | Tests | Notes |\n|---|---|---|---|---|\n${rows}\n| [YYYY-MM-DD] | [Block name] | - | - | - |\n`;
}

describe('session-orientation: tier detection', () => {
  it('detects tier M from the pipeline heading', () => {
    const dir = setup({ '.claude/rules/pipeline.md': PIPELINE.M });
    assert.match(run(dir), /Tierward tier-M/);
  });

  it('detects tier L from the pipeline heading', () => {
    const dir = setup({ '.claude/rules/pipeline.md': PIPELINE.L });
    assert.match(run(dir), /Tierward tier-L/);
  });

  it('detects tier S from the Fast Lane heading', () => {
    const dir = setup({ '.claude/rules/pipeline.md': PIPELINE.S });
    assert.match(run(dir), /Tierward tier-S/);
  });

  it('is silent when no pipeline.md exists (tier 0 / non-piped)', () => {
    const dir = setup({ 'CLAUDE.md': '# proj\n' });
    assert.equal(run(dir), '');
  });
});

describe('session-orientation: fires on every source (incl. post-compact)', () => {
  it('emits on source=compact — PostCompact restores only CLAUDE.local.md, not orientation', () => {
    const dir = setup({ '.claude/rules/pipeline.md': PIPELINE.M });
    assert.match(run(dir, { source: 'compact' }), /Tierward tier-M/);
  });

  it('emits on source=resume', () => {
    const dir = setup({ '.claude/rules/pipeline.md': PIPELINE.M });
    assert.match(run(dir, { source: 'resume' }), /Tierward tier-M/);
  });

  it('does not depend on stdin (emits with empty stdin)', () => {
    const dir = setup({ '.claude/rules/pipeline.md': PIPELINE.M });
    const out = execFileSync('node', [SCRIPT], {
      input: '',
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
      encoding: 'utf8',
    }).trim();
    assert.match(out, /Tierward tier-M/);
  });
});

describe('session-orientation: active block state', () => {
  it('reports an approved active block', () => {
    const dir = setup({
      '.claude/rules/pipeline.md': PIPELINE.M,
      '.claude/session/block-auth.md':
        '---\nblock: auth\nrequirements_approved: true\n---\nnotes\n',
    });
    const out = run(dir);
    assert.match(out, /active block: auth/);
    assert.match(out, /requirements approved/);
    assert.match(out, /Resume from the session file/);
  });

  it('reports a not-yet-approved active block', () => {
    const dir = setup({
      '.claude/rules/pipeline.md': PIPELINE.M,
      '.claude/session/block-auth.md':
        '---\nblock: auth\nrequirements_approved: false\n---\nnotes\n',
    });
    const out = run(dir);
    assert.match(out, /requirements not yet approved/);
    assert.match(out, /Phase 1 STOP gate/);
  });

  it('treats the new-session placeholder as unnamed in-progress', () => {
    const dir = setup({
      '.claude/rules/pipeline.md': PIPELINE.M,
      '.claude/session/block-new-session.md':
        '---\nblock: new-session\nrequirements_approved: false\n---\n',
    });
    assert.match(run(dir), /block unnamed/);
  });
});

describe('session-orientation: branch', () => {
  it('shows a feature branch', () => {
    const dir = setup({
      '.claude/rules/pipeline.md': PIPELINE.M,
      '.git/HEAD': 'ref: refs/heads/feature/billing\n',
    });
    assert.match(run(dir), /branch feature\/billing/);
  });

  it('hides main/staging (no actionable branch signal)', () => {
    const dir = setup({
      '.claude/rules/pipeline.md': PIPELINE.M,
      '.git/HEAD': 'ref: refs/heads/main\n',
    });
    // The banner's branch part is the ` · branch <name>` segment; the closing hint
    // also contains the word "branch", so assert on the structural segment only.
    assert.doesNotMatch(run(dir), /· branch /);
  });
});

describe('session-orientation: discovery', () => {
  it('flags pending greenfield discovery', () => {
    const dir = setup({
      '.claude/rules/pipeline.md': PIPELINE.M,
      'CONTEXT_IMPORT.md': '**Status**: `PENDING_DISCOVERY`\n',
    });
    const out = run(dir);
    assert.match(out, /discovery pending/);
    assert.match(out, /Phase 0/);
  });
});

describe('session-orientation: arch-audit nag gating', () => {
  it('does NOT nag on a fresh project (0 completed blocks)', () => {
    const dir = setup({ '.claude/rules/pipeline.md': PIPELINE.M });
    assert.doesNotMatch(run(dir), /Arch audit overdue/);
  });

  it('nags once >=1 block completed and the audit is overdue (never run)', () => {
    const dir = setup({
      '.claude/rules/pipeline.md': PIPELINE.M,
      'docs/implementation-checklist.md': checklistWith(['2026-05-01', '2026-05-10']),
    });
    const out = run(dir);
    assert.match(out, /2 blocks completed/);
    assert.match(out, /Arch audit overdue/);
  });

  it('does NOT nag when the audit ran recently, even with completed blocks', () => {
    const now = Math.floor(Date.now() / 1000);
    const dir = setup({
      '.claude/rules/pipeline.md': PIPELINE.M,
      'docs/implementation-checklist.md': checklistWith(['2026-05-01']),
      '.claude/session/last-arch-audit': String(now),
    });
    assert.doesNotMatch(run(dir), /Arch audit overdue/);
  });

  it('ignores the [YYYY-MM-DD] placeholder row when counting completed blocks', () => {
    const dir = setup({
      '.claude/rules/pipeline.md': PIPELINE.M,
      // only the placeholder row, no real dates
      'docs/implementation-checklist.md':
        '# Checklist\n## Log\n| Date | Block |\n|---|---|\n| [YYYY-MM-DD] | [Block name] |\n',
    });
    const out = run(dir);
    assert.match(out, /no active block/);
    assert.doesNotMatch(out, /Arch audit overdue/);
  });
});

describe('session-orientation: robustness', () => {
  it('never throws and exits cleanly with only a pipeline.md present', () => {
    const dir = setup({ '.claude/rules/pipeline.md': PIPELINE.M });
    const out = run(dir);
    assert.match(out, /no active block yet/);
  });
});
