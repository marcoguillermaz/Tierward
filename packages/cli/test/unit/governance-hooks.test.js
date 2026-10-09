// Regression suite for the N-2b governance enforcement hooks (Tierward v1.34+).
//
// Two hooks invert "governance is soft, verification is hard":
//   - tierward-capture-approval.mjs (UserPromptSubmit): records the HUMAN's approval
//     keyword from the raw prompt into the session file — outside Claude's authorship.
//   - tierward-governance-gate.mjs (PreToolUse Bash): blocks `git commit` until the
//     active block's requirements are approved.
//
// Scope: mechanical for a COOPERATIVE agent (the captured approval originates from the
// human's prompt). NOT forge-proof against an adversarial agent that removes the hook
// from settings.json — that needs org-level managed settings. These tests verify the
// cooperative-model mechanism, not adversarial forge-resistance.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOKS = path.resolve(__dirname, '../../templates/common/.claude/hooks');
const CAPTURE = path.join(HOOKS, 'tierward-capture-approval.mjs');
const GATE = path.join(HOOKS, 'tierward-governance-gate.mjs');

// Run a hook with the given stdin JSON in an isolated project dir. Returns
// { stdout, sessionContent } — sessionContent is the session file after the run
// (or null if no session file was seeded).
function runHook(hookPath, stdinObj, { sessionFrontMatter, sessionFileName } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-gov-'));
  const sessionDir = path.join(dir, '.claude', 'session');
  let sessionFile = null;
  if (sessionFrontMatter !== undefined) {
    fs.mkdirSync(sessionDir, { recursive: true });
    sessionFile = path.join(sessionDir, sessionFileName || 'block-test.md');
    fs.writeFileSync(sessionFile, `---\n${sessionFrontMatter}\n---\n# Block: test\n`);
  }
  try {
    const stdout = execFileSync('node', [hookPath], {
      input: JSON.stringify(stdinObj),
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const sessionContent = sessionFile ? fs.readFileSync(sessionFile, 'utf8') : null;
    return { stdout, sessionContent };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('capture-approval hook (UserPromptSubmit)', () => {
  it('records approval on a bare execution keyword (+ optional punctuation)', () => {
    for (const kw of ['Execute', 'Proceed', 'Confirmed', 'Go ahead', 'Proceed.', 'Execute!']) {
      const { sessionContent } = runHook(
        CAPTURE,
        { prompt: kw },
        { sessionFrontMatter: 'block: test\nrequirements_approved: false' },
      );
      assert.match(sessionContent, /requirements_approved:\s*true/, `bare "${kw}" must approve`);
    }
  });

  it('does NOT approve a keyword followed by other words (casual imperative guard)', () => {
    // "Proceed to the next file" / "Proceed with the refactor" are imperatives, not
    // scope approvals — they must NOT arm the gate.
    for (const prompt of [
      'Proceed to the next file',
      'Proceed with the refactor',
      'Execute the build script',
    ]) {
      const { sessionContent } = runHook(
        CAPTURE,
        { prompt },
        { sessionFrontMatter: 'block: test\nrequirements_approved: false' },
      );
      assert.match(
        sessionContent,
        /requirements_approved:\s*false/,
        `"${prompt}" must NOT approve`,
      );
    }
  });

  it('does NOT approve when the keyword is mid-sentence', () => {
    const { sessionContent } = runHook(
      CAPTURE,
      { prompt: 'should I proceed?' },
      { sessionFrontMatter: 'block: test\nrequirements_approved: false' },
    );
    assert.match(sessionContent, /requirements_approved:\s*false/);
  });

  it('never blocks the prompt (always exits 0, never emits a decision JSON)', () => {
    const { stdout } = runHook(
      CAPTURE,
      { prompt: 'Proceed' },
      { sessionFrontMatter: 'block: test\nrequirements_approved: false' },
    );
    assert.ok(
      !stdout.includes('"decision"') && !stdout.includes('"permissionDecision"'),
      'capture hook must not emit a block/deny decision',
    );
  });

  it('emits a one-time star CTA on first approval (additionalContext for model)', () => {
    const { stdout } = runHook(
      CAPTURE,
      { prompt: 'Proceed' },
      { sessionFrontMatter: 'block: test\nrequirements_approved: false' },
    );
    assert.ok(stdout.includes('★'), 'star CTA emitted on first approval');
    assert.ok(stdout.includes('github.com/marcoguillermaz/Tierward'), 'GitHub URL present');
  });

  it('does not emit star CTA when already approved (idempotent)', () => {
    const { stdout } = runHook(
      CAPTURE,
      { prompt: 'Proceed' },
      { sessionFrontMatter: 'block: test\nrequirements_approved: true' },
    );
    assert.ok(!stdout.includes('★'), 'no star CTA when block was already approved');
  });

  it('adds the approval field when the session file front matter lacks it', () => {
    const { sessionContent } = runHook(
      CAPTURE,
      { prompt: 'Proceed' },
      { sessionFrontMatter: 'block: test' },
    );
    assert.match(sessionContent, /requirements_approved:\s*true/);
  });

  it('no-ops safely when there is no session file', () => {
    // No sessionFrontMatter → no session dir. Must not throw.
    const { stdout } = runHook(CAPTURE, { prompt: 'Proceed' });
    assert.equal(stdout.trim(), '');
  });
});

describe('capture-approval hook — promotion keyword (bare Promote)', () => {
  it('arms promotion_approved on a bare `Promote` (+ optional punctuation)', () => {
    for (const kw of ['Promote', 'promote', 'Promote.', 'Promote!']) {
      const { sessionContent } = runHook(
        CAPTURE,
        { prompt: kw },
        { sessionFrontMatter: 'block: test\nrequirements_approved: false' },
      );
      assert.match(sessionContent, /promotion_approved:\s*true/, `bare "${kw}" must arm promotion`);
    }
  });

  it('does NOT arm requirements_approved on `Promote` (disjoint signals)', () => {
    const { sessionContent } = runHook(
      CAPTURE,
      { prompt: 'Promote' },
      { sessionFrontMatter: 'block: test\nrequirements_approved: false' },
    );
    assert.match(sessionContent, /requirements_approved:\s*false/);
  });

  it('does NOT arm promotion on `Promote` followed by other words', () => {
    for (const prompt of ['Promote to staging', 'Promote the fix', 'please promote']) {
      const { sessionContent } = runHook(
        CAPTURE,
        { prompt },
        { sessionFrontMatter: 'block: test' },
      );
      assert.ok(
        !/promotion_approved:\s*true/.test(sessionContent),
        `"${prompt}" must NOT arm promotion`,
      );
    }
  });

  it('does NOT arm promotion on execution keywords (Proceed never promotes)', () => {
    const { sessionContent } = runHook(
      CAPTURE,
      { prompt: 'Proceed' },
      { sessionFrontMatter: 'block: test\nrequirements_approved: false' },
    );
    assert.ok(!/promotion_approved:\s*true/.test(sessionContent));
  });

  it('works on a Fast Lane fix-*.md session file (tier S)', () => {
    const { sessionContent } = runHook(
      CAPTURE,
      { prompt: 'Promote' },
      {
        sessionFrontMatter: 'fix: test\nrequirements_approved: false',
        sessionFileName: 'fix-test.md',
      },
    );
    assert.match(sessionContent, /promotion_approved:\s*true/);
  });
});

describe('governance-gate hook (PreToolUse Bash)', () => {
  const blocked = (out) => out.includes('"permissionDecision":"deny"');

  it('blocks `git commit` when requirements are not approved', () => {
    const { stdout } = runHook(
      GATE,
      { tool_name: 'Bash', tool_input: { command: 'git commit -m "x"' } },
      { sessionFrontMatter: 'block: test\nrequirements_approved: false' },
    );
    assert.ok(blocked(stdout), 'commit must be denied when not approved');
  });

  it('allows `git commit` once requirements are approved', () => {
    const { stdout } = runHook(
      GATE,
      { tool_name: 'Bash', tool_input: { command: 'git commit -m "x"' } },
      { sessionFrontMatter: 'block: test\nrequirements_approved: true' },
    );
    assert.equal(stdout.trim(), '', 'approved commit must pass with no decision');
  });

  it('allows non-commit commands regardless of approval', () => {
    const { stdout } = runHook(
      GATE,
      { tool_name: 'Bash', tool_input: { command: 'ls -la' } },
      { sessionFrontMatter: 'block: test\nrequirements_approved: false' },
    );
    assert.equal(stdout.trim(), '');
  });

  it('does not false-positive on git commit-tree / commit-graph', () => {
    for (const cmd of ['git commit-tree abc', 'git commit-graph write']) {
      const { stdout } = runHook(
        GATE,
        { tool_name: 'Bash', tool_input: { command: cmd } },
        { sessionFrontMatter: 'block: test\nrequirements_approved: false' },
      );
      assert.equal(stdout.trim(), '', `"${cmd}" must not be gated as a commit`);
    }
  });

  it('catches `git commit` after inline config flags', () => {
    const { stdout } = runHook(
      GATE,
      { tool_name: 'Bash', tool_input: { command: 'git -c user.name=x commit -m y' } },
      { sessionFrontMatter: 'block: test\nrequirements_approved: false' },
    );
    assert.ok(blocked(stdout), 'commit behind -c flags must still be gated');
  });

  it('allows commits when no active block (gate inactive without a session file)', () => {
    const { stdout } = runHook(GATE, {
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "x"' },
    });
    assert.equal(stdout.trim(), '', 'no session file → governance gate inactive');
  });
});

describe('governance-gate hook — promotion push gate', () => {
  const blocked = (out) => out.includes('"permissionDecision":"deny"');
  const PROMO_CMD =
    'git checkout staging && git merge feature/x --no-ff && git push origin staging';

  it('blocks a promotion push to staging without promotion_approved', () => {
    const { stdout } = runHook(
      GATE,
      { tool_name: 'Bash', tool_input: { command: PROMO_CMD } },
      { sessionFrontMatter: 'block: test\nrequirements_approved: true\npromotion_approved: false' },
    );
    assert.ok(blocked(stdout), 'unauthorized promotion must be denied');
    assert.ok(stdout.includes('Promote'), 'deny reason must name the Promote keyword');
  });

  it('blocks a promotion push to main without promotion_approved', () => {
    const { stdout } = runHook(
      GATE,
      {
        tool_name: 'Bash',
        tool_input: {
          command: 'git checkout main && git merge staging --no-ff && git push origin main',
        },
      },
      { sessionFrontMatter: 'block: test\nrequirements_approved: true' },
    );
    assert.ok(blocked(stdout), 'absent flag counts as not approved');
  });

  it('a prior requirements approval does NOT cover promotion (leak guard)', () => {
    const { stdout } = runHook(
      GATE,
      { tool_name: 'Bash', tool_input: { command: 'git push origin staging' } },
      { sessionFrontMatter: 'block: test\nrequirements_approved: true' },
    );
    assert.ok(blocked(stdout));
  });

  it('allows the push when promotion_approved and consumes the flag (one-shot)', () => {
    const { stdout, sessionContent } = runHook(
      GATE,
      { tool_name: 'Bash', tool_input: { command: PROMO_CMD } },
      { sessionFrontMatter: 'block: test\nrequirements_approved: true\npromotion_approved: true' },
    );
    assert.equal(stdout.trim(), '', 'authorized promotion must pass');
    assert.match(
      sessionContent,
      /promotion_approved:\s*false/,
      'flag must be consumed after allow',
    );
  });

  it('allows pushes to non-protected branches regardless of the flag', () => {
    for (const cmd of ['git push origin feature/x', 'git push -u origin fix/bug-123']) {
      const { stdout } = runHook(
        GATE,
        { tool_name: 'Bash', tool_input: { command: cmd } },
        { sessionFrontMatter: 'block: test\npromotion_approved: false' },
      );
      assert.equal(stdout.trim(), '', `"${cmd}" must not be gated as a promotion`);
    }
  });

  it('does not false-positive on branch names containing main/staging as a segment', () => {
    const { stdout } = runHook(
      GATE,
      { tool_name: 'Bash', tool_input: { command: 'git push origin feature/main-nav' } },
      { sessionFrontMatter: 'block: test\npromotion_approved: false' },
    );
    assert.equal(stdout.trim(), '');
  });

  it('catches HEAD:main refspec pushes', () => {
    const { stdout } = runHook(
      GATE,
      { tool_name: 'Bash', tool_input: { command: 'git push origin HEAD:main' } },
      { sessionFrontMatter: 'block: test\npromotion_approved: false' },
    );
    assert.ok(blocked(stdout), 'refspec promotion must be gated');
  });

  it('gates the Fast Lane fix-*.md session file too (tier S)', () => {
    const { stdout } = runHook(
      GATE,
      { tool_name: 'Bash', tool_input: { command: 'git push origin staging' } },
      {
        sessionFrontMatter: 'fix: test\nrequirements_approved: true',
        sessionFileName: 'fix-test.md',
      },
    );
    assert.ok(blocked(stdout));
  });

  it('promotion gate inactive without a session file (fail-open, like the commit gate)', () => {
    const { stdout } = runHook(GATE, {
      tool_name: 'Bash',
      tool_input: { command: 'git push origin staging' },
    });
    assert.equal(stdout.trim(), '');
  });
});

// The gate reads the commands a Bash call runs, not its whole text: quoted
// strings and heredoc bodies are data, `$(...)` and backticks are code.
// Baseline for the differential checks: the v2.0.1 whole-string regexes,
// copied here so CI needs no old file. A command they deny that the new gate
// allows must be listed as an intended fix; anything else is a regression.
const V201_PUSH_RE = /\bgit\s+([^\n]*\s)?push(\s|$)/;
const V201_PROTECTED_REF_RE = /(^|[\s:'"])(staging|main)(?=$|[\s:'".])/;
const V201_COMMIT_RE = /\bgit\s+([^\n]*\s)?commit(\s|$)/;
const v201DeniesPush = (cmd) => V201_PUSH_RE.test(cmd) && V201_PROTECTED_REF_RE.test(cmd);

const CLAUDE_COMMIT = [
  `git commit -m "$(cat <<'EOF'`,
  `fix: don't git push origin main by hand`,
  ``,
  `Co-Authored-By: Claude <noreply@anthropic.com>`,
  `EOF`,
  `)"`,
].join('\n');

// Denied by v2.0.1 as promotions, allowed now: protected names in data only.
const PUSH_INTENDED_FIXES = [
  'git commit -m "docs: explain push to staging or main"',
  'git commit -m "chore: git push origin main is gated"',
  'echo "git push origin main"',
  `printf '%s\\n' 'git push origin staging'`,
  'git push -u origin feature/x && gh pr create --base main',
  'git push -u origin feature/x && gh pr create --base main --title "Push to main"',
  ['git commit -F - <<EOF', 'fix: stop git push origin main from slipping', 'EOF'].join('\n'),
  CLAUDE_COMMIT,
  'git push origin feature/x # git push origin main comes later',
  // Destination is not protected: pushes local main to a feature branch.
  'git push origin main:feature/x',
];

const PUSH_MUST_DENY = [
  'git push origin staging',
  'git push origin main',
  'git push origin "main"',
  "git push origin 'staging'",
  'git push origin HEAD:main',
  'git push origin +main',
  'git push origin HEAD:refs/heads/main',
  'git push origin refs/heads/staging',
  'git push -f origin main',
  'git push --force-with-lease origin main',
  'git commit -m "x" && git push origin main',
  'git checkout staging && git merge feature/x --no-ff && git push origin staging',
  'git status; git push origin main',
  'git status\ngit push origin main',
  'git fetch || git push origin main',
  'git push origin main 2>&1 | tail -n 5',
  'git push origin main >/dev/null',
  'git -C repo push origin main',
  'git -c push.default=current push origin main',
  'git --git-dir=.git --work-tree=. push origin main',
  'git --no-pager push origin main',
  '/usr/bin/git push origin main',
  'GIT_TRACE=1 git push origin main',
  'env GIT_TRACE=1 git push origin main',
  'command git push origin main',
  'time git push origin staging',
  "bash -c 'git push origin main'",
  'sh -lc "git push origin staging"',
  "zsh -c 'cd repo && git push origin main'",
  '(cd repo && git push origin main)',
  'git commit -m "$(git push origin main)"',
  'git commit -m "`git push origin main`"',
  'echo $(git push origin main)',
  'git push origin \\\nmain',
  "git push origin $'main'",
  'git push origin $"staging"',
];

const PUSH_STABLE_ALLOW = [
  'git push origin feature/main-nav',
  'git push -u origin fix/bug-123',
  'git log --oneline main',
  'git status',
  'ls -la',
];

describe('governance-gate hook — command segments, promotion gate (D5)', () => {
  const blocked = (out) => out.includes('"permissionDecision":"deny"');
  const FM = 'block: test\nrequirements_approved: true\npromotion_approved: false';
  const run = (command) =>
    runHook(GATE, { tool_name: 'Bash', tool_input: { command } }, { sessionFrontMatter: FM });

  it('allows commands that name a protected branch only in data', () => {
    for (const cmd of PUSH_INTENDED_FIXES) {
      assert.equal(run(cmd).stdout.trim(), '', `must not be gated as a promotion:\n${cmd}`);
    }
  });

  it('still denies every real promotion push form', () => {
    for (const cmd of PUSH_MUST_DENY) {
      const { stdout } = run(cmd);
      assert.ok(blocked(stdout) && stdout.includes('Promote'), `must be gated:\n${cmd}`);
    }
  });

  it('keeps allowing pushes and commands that never touch a protected branch', () => {
    for (const cmd of PUSH_STABLE_ALLOW) {
      assert.equal(run(cmd).stdout.trim(), '', `must stay allowed:\n${cmd}`);
    }
  });

  it('differential: nothing v2.0.1 denied is allowed now unless listed as a fix', () => {
    for (const cmd of PUSH_INTENDED_FIXES) {
      assert.ok(v201DeniesPush(cmd), `stale intended-fix entry, v2.0.1 allowed it:\n${cmd}`);
    }
    const intended = new Set(PUSH_INTENDED_FIXES);
    for (const cmd of [...PUSH_INTENDED_FIXES, ...PUSH_MUST_DENY, ...PUSH_STABLE_ALLOW]) {
      if (v201DeniesPush(cmd) && !blocked(run(cmd).stdout)) {
        assert.ok(intended.has(cmd), `newly allowed, not an intended fix:\n${cmd}`);
      }
    }
  });

  it('falls back to the whole-text check when the command cannot be parsed', () => {
    // Nesting beyond the parser's depth limit makes it give up; the push must
    // still be gated by the v2.0.1 whole-text test, not allowed.
    const deep = `${'echo "$('.repeat(40)}git push origin main ${')"'.repeat(40)}`;
    assert.ok(blocked(run(deep).stdout), 'unparseable command must fall back, not allow');
  });

  it('falls back to the whole-text check on unterminated quotes, substitutions and heredocs', () => {
    for (const cmd of [
      'git push origin main "',
      "git push origin main '",
      'git push origin main $(echo',
      'git push origin main `echo',
      'git push origin main && cat <<EOF\nbody',
    ]) {
      assert.ok(blocked(run(cmd).stdout), `malformed command must fall back:\n${cmd}`);
    }
    // A malformed command whose push is only in quoted text is judged like v2.0.1.
    const quoted = 'git commit -m "git push origin main ';
    assert.equal(blocked(run(quoted).stdout), v201DeniesPush(quoted));
  });
});

describe('governance-gate hook — command segments, commit gate (D5)', () => {
  const blocked = (out) => out.includes('"permissionDecision":"deny"');
  const FM = 'block: test\nrequirements_approved: false\npromotion_approved: false';
  const run = (command) =>
    runHook(GATE, { tool_name: 'Bash', tool_input: { command } }, { sessionFrontMatter: FM });

  const COMMIT_INTENDED_FIXES = ['git log --grep commit', 'echo "git commit -m x"'];
  const COMMIT_MUST_DENY = [
    'git commit -m "x"',
    'git add src/a.js && git commit -m "x"',
    'git -C repo commit -m x',
    "bash -c 'git commit -m x'",
    'git status; git commit --amend --no-edit',
    CLAUDE_COMMIT,
  ];

  it('denies a real commit before approval, also inside a compound', () => {
    for (const cmd of COMMIT_MUST_DENY) {
      const { stdout } = run(cmd);
      assert.ok(blocked(stdout), `commit must be gated:\n${cmd}`);
    }
  });

  it('allows commands that only mention `commit`', () => {
    for (const cmd of COMMIT_INTENDED_FIXES) {
      assert.equal(run(cmd).stdout.trim(), '', `must not be gated as a commit:\n${cmd}`);
    }
  });

  it('differential: nothing v2.0.1 denied as a commit is allowed now unless listed', () => {
    const intended = new Set(COMMIT_INTENDED_FIXES);
    for (const cmd of [...COMMIT_INTENDED_FIXES, ...COMMIT_MUST_DENY]) {
      if (V201_COMMIT_RE.test(cmd) && !blocked(run(cmd).stdout)) {
        assert.ok(intended.has(cmd), `newly allowed commit, not an intended fix:\n${cmd}`);
      }
    }
  });
});
