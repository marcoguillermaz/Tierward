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
function runHook(hookPath, stdinObj, { sessionFrontMatter, sessionFileName, env } = {}) {
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
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir, ...env },
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

  // DEC-72: inside a block worktree step 10 runs each git with `-C ../../..`,
  // the main working tree; the gate treats that form exactly like the plain one.
  it('gates the worktree form of step 10 (git -C ../../..) like the plain one', () => {
    const command =
      'git -C ../../.. checkout main && git -C ../../.. merge staging --no-ff && git -C ../../.. push origin main';
    const denied = runHook(
      GATE,
      { tool_name: 'Bash', tool_input: { command } },
      { sessionFrontMatter: 'block: test\nrequirements_approved: true' },
    );
    assert.ok(blocked(denied.stdout), 'the worktree form needs Promote too');
    const allowed = runHook(
      GATE,
      { tool_name: 'Bash', tool_input: { command } },
      { sessionFrontMatter: 'block: test\nrequirements_approved: true\npromotion_approved: true' },
    );
    assert.equal(allowed.stdout.trim(), '', 'authorized worktree form must pass');
    assert.match(allowed.sessionContent, /promotion_approved:\s*false/, 'flag consumed');
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

  it('asks for confirmation of a promotion push without a session file (no block, no Promote)', () => {
    const { stdout } = runHook(GATE, {
      tool_name: 'Bash',
      tool_input: { command: 'git push origin staging' },
    });
    assert.ok(stdout.includes('"permissionDecision":"ask"'), stdout);
  });
});

// A push of every branch, or a mirror push, updates `main` and `staging`
// without naming them (DEC-56 A): it is a promotion like a named push.
describe('governance-gate hook — all-branches and mirror pushes (DEC-56 A)', () => {
  const decision = (out) => (out.match(/"permissionDecision":"(\w+)"/) || [])[1] || 'allow';
  const FM = 'block: test\nrequirements_approved: true\npromotion_approved: false';
  const bash = (command, opts) =>
    runHook(GATE, { tool_name: 'Bash', tool_input: { command } }, opts);
  const ALL_BRANCHES = [
    'git push --all',
    'git push --all origin',
    'git push origin --all',
    'git push --mirror origin',
    'git push --all --force origin',
    'git fetch && git push --all origin',
  ];

  it('denies a push of every branch or a mirror push inside a block without `Promote`', () => {
    for (const cmd of ALL_BRANCHES) {
      const { stdout } = bash(cmd, { sessionFrontMatter: FM });
      assert.equal(decision(stdout), 'deny', cmd);
    }
  });

  it('allows it once with `Promote`, and asks outside a block', () => {
    const fm = 'block: test\nrequirements_approved: true\npromotion_approved: true';
    assert.equal(bash('git push --all origin', { sessionFrontMatter: fm }).stdout, '');
    assert.equal(decision(bash('git push --mirror origin').stdout), 'ask');
  });

  it('leaves pushes of tags or of one work branch alone', () => {
    for (const cmd of [
      'git push --tags',
      'git push origin --tags',
      'git push -u origin feature/all',
    ]) {
      assert.equal(bash(cmd, { sessionFrontMatter: FM }).stdout, '', cmd);
    }
  });
});

// A push that names no branch updates the current branch, or its upstream
// (DEC-59 b): the gate asks git which branch that is. When git cannot tell
// (no repository, detached HEAD), the push counts as a promotion.
describe('governance-gate hook — pushes that name no branch (DEC-59 b)', () => {
  const decision = (out) => (out.match(/"permissionDecision":"(\w+)"/) || [])[1] || 'allow';
  const FM = 'block: test\nrequirements_approved: true\npromotion_approved: false';
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'ignore' });
  // A repository checked out on `branch`, optionally tracking `upstream`.
  function repoOn(branch, upstream) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-gate-repo-'));
    git(dir, 'init', '-q');
    git(dir, 'symbolic-ref', 'HEAD', `refs/heads/${branch}`);
    if (upstream) {
      git(dir, 'config', `branch.${branch}.remote`, 'origin');
      git(dir, 'config', `branch.${branch}.merge`, `refs/heads/${upstream}`);
    }
    return dir;
  }
  const push = (command, cwd, opts) =>
    decision(runHook(GATE, { tool_name: 'Bash', tool_input: { command }, cwd }, opts).stdout);
  const NO_BRANCH = [
    'git push',
    'git push origin',
    'git push -u origin HEAD',
    'git push origin HEAD',
    'git push origin @',
    'git push --force-with-lease',
    'git fetch && git push',
  ];

  it('treats them as a promotion when the current branch is main or staging', () => {
    for (const branch of ['main', 'staging']) {
      const dir = repoOn(branch);
      try {
        for (const cmd of NO_BRANCH) {
          assert.equal(push(cmd, dir, { sessionFrontMatter: FM }), 'deny', `${branch}: ${cmd}`);
        }
        assert.equal(push('git push', dir), 'ask', `${branch}: outside a block`);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('reads the branch of the repository `git -C` names', () => {
    const dir = repoOn('main');
    const work = repoOn('feature/x');
    try {
      assert.equal(push(`git -C ${dir} push`, work, { sessionFrontMatter: FM }), 'deny');
      // a relative -C resolves against the session's directory
      const rel = path.relative(work, dir);
      assert.equal(push(`git -C ${rel} push`, work, { sessionFrontMatter: FM }), 'deny');
      assert.equal(push(`git -C ${work} push`, dir, { sessionFrontMatter: FM }), 'allow');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(work, { recursive: true, force: true });
    }
  });

  it('treats them as a promotion when the upstream is main', () => {
    const dir = repoOn('feature/x', 'main');
    try {
      assert.equal(push('git push', dir, { sessionFrontMatter: FM }), 'deny');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // `HEAD` and `@` push to the remote branch of the same name whatever the
  // upstream (DEC-78, F11); only a bare push may go to the upstream.
  it('checks only the current branch for an explicit `HEAD` or `@` refspec', () => {
    const dir = repoOn('feature/x', 'main');
    try {
      for (const cmd of ['git push -u origin HEAD', 'git push origin HEAD', 'git push origin @']) {
        assert.equal(push(cmd, dir, { sessionFrontMatter: FM }), 'allow', cmd);
        assert.equal(push(cmd, dir), 'allow', `${cmd}, outside a block`);
      }
      assert.equal(push('git push', dir, { sessionFrontMatter: FM }), 'deny', 'bare: upstream');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // `$VAR`, `${VAR}` and a leading `~` in a `git -C` path are expanded from
  // the hook's environment (DEC-78, F13); an unset variable stays unknown.
  it('expands `$VAR` and `~` in a `git -C` path', () => {
    const main = repoOn('main');
    const work = repoOn('feature/x', 'feature/x');
    const env = { WORK_REPO: work, HOME: work };
    try {
      for (const cmd of [
        'git -C "$WORK_REPO" push origin HEAD',
        'git -C "${WORK_REPO}" push',
        'git -C ~ push origin HEAD',
        'git -C ~/ push origin HEAD',
      ]) {
        assert.equal(push(cmd, main, { sessionFrontMatter: FM, env }), 'allow', cmd);
      }
      assert.equal(
        push('git -C "$NOT_SET_ANYWHERE" push origin HEAD', work, { sessionFrontMatter: FM, env }),
        'deny',
        'an unset variable leaves the repository unknown',
      );
      assert.equal(
        push('git -C "$WORK_REPO" push origin HEAD', work, {
          sessionFrontMatter: FM,
          env: { WORK_REPO: main },
        }),
        'deny',
        'the variable names a repository on main',
      );
    } finally {
      fs.rmSync(main, { recursive: true, force: true });
      fs.rmSync(work, { recursive: true, force: true });
    }
  });

  it('leaves them alone on a work branch', () => {
    const dir = repoOn('feature/x', 'feature/x');
    try {
      for (const cmd of NO_BRANCH) {
        assert.equal(push(cmd, dir, { sessionFrontMatter: FM }), 'allow', cmd);
      }
      assert.equal(push('git push --tags', dir, { sessionFrontMatter: FM }), 'allow');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('pushes of tags only never need the branch', () => {
    const dir = repoOn('main');
    try {
      assert.equal(push('git push --tags', dir, { sessionFrontMatter: FM }), 'allow');
      assert.equal(push('git push origin --tags', dir, { sessionFrontMatter: FM }), 'allow');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('counts them as a promotion when git cannot tell the branch', () => {
    const notRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-gate-norepo-'));
    const detached = repoOn('main');
    try {
      git(
        detached,
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@example.com',
        'commit',
        '--allow-empty',
        '-q',
        '-m',
        'x',
      );
      git(detached, 'checkout', '-q', '--detach');
      assert.equal(push('git push', notRepo, { sessionFrontMatter: FM }), 'deny', 'no repository');
      assert.equal(push('git push origin HEAD', detached, { sessionFrontMatter: FM }), 'deny');
    } finally {
      fs.rmSync(notRepo, { recursive: true, force: true });
      fs.rmSync(detached, { recursive: true, force: true });
    }
  });

  // A command the parser cannot read (an unterminated quote, substitution or
  // heredoc) that carries a push naming no protected branch is judged like a
  // push that names no branch: git decides (DEC-75, F5).
  it('reads an unreadable command with a push that names no protected branch as a push without a branch', () => {
    const malformed = [
      'git push\ncat <<EOF\nx',
      "git push origin HEAD; echo 'x",
      'git push origin HEAD; echo $(date',
      'git push origin feature/x\ncat <<EOF\nx',
    ];
    const main = repoOn('main');
    const work = repoOn('feature/x', 'feature/x');
    try {
      for (const cmd of malformed) {
        assert.equal(push(cmd, main, { sessionFrontMatter: FM }), 'deny', `main: ${cmd}`);
        assert.equal(push(cmd, main), 'ask', `main, no block: ${cmd}`);
        assert.equal(push(cmd, work, { sessionFrontMatter: FM }), 'allow', `feature/x: ${cmd}`);
      }
    } finally {
      fs.rmSync(main, { recursive: true, force: true });
      fs.rmSync(work, { recursive: true, force: true });
    }
  });

  it('reads `--all` and `--mirror` on the push itself, not elsewhere in an unreadable command', () => {
    const work = repoOn('feature/x', 'feature/x');
    const inBlock = { sessionFrontMatter: FM };
    try {
      assert.equal(
        push('git log --all && git push origin feature/x\ncat <<EOF\nx', work, inBlock),
        'allow',
      );
      assert.equal(push('git push --all\ncat <<EOF\nx', work, inBlock), 'deny');
      assert.equal(push('git push origin --mirror\ncat <<EOF\nx', work, inBlock), 'deny');
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  });
});

// The gate asks git twice for a push that names no branch, each call with its
// own timeout. Their sum plus node's start-up must stay under the hook timeout
// the tier templates wire, or Claude Code cancels the gate and the push goes
// through unchecked (F6).
describe('governance-gate hook — git latency vs the hook timeout (F6)', () => {
  const TEMPLATES = path.resolve(__dirname, '../../templates');
  const perCallMs = Number((fs.readFileSync(GATE, 'utf8').match(/timeout:\s*(\d+)/) || [])[1]);
  const gateEntries = ['tier-s', 'tier-m', 'tier-l'].flatMap((tier) => {
    const file = path.join(TEMPLATES, tier, '.claude', 'settings.json');
    const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
    return settings.hooks.PreToolUse.flatMap((group) => group.hooks)
      .filter((h) => h.command.includes('tierward-governance-gate.mjs'))
      .map((h) => ({ tier, timeout: h.timeout }));
  });

  it('wires the gate with a hook timeout that covers 2 git calls plus node start-up', () => {
    assert.ok(perCallMs > 0, 'the gate sets a timeout on each git call');
    assert.equal(gateEntries.length, 6, 'Bash and MCP entries on tiers S, M and L');
    for (const { tier, timeout } of gateEntries) {
      assert.ok(
        timeout * 1000 >= 2 * perCallMs + 2000,
        `${tier}: "timeout": ${timeout} cannot cover 2 git calls of ${perCallMs} ms plus start-up`,
      );
    }
  });

  it('answers before the hook timeout when git is slow but does not time out', () => {
    const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
    const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-gate-slowgit-'));
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-gate-repo-'));
    const calls = path.join(stubDir, 'calls');
    try {
      // Half the per-call timeout: slow, with room left for the shell and git
      // themselves, so both calls complete and the gate takes its normal path.
      const sleep = (perCallMs / 2000).toFixed(1);
      fs.writeFileSync(
        path.join(stubDir, 'git'),
        `#!/bin/sh\necho "$*" >> "${calls}"\nsleep ${sleep}\nexec "${realGit}" "$@"\n`,
        { mode: 0o755 },
      );
      execFileSync(realGit, ['init', '-q'], { cwd: repo });
      execFileSync(realGit, ['symbolic-ref', 'HEAD', 'refs/heads/main'], { cwd: repo });
      execFileSync(realGit, ['config', 'branch.main.merge', 'refs/heads/main'], { cwd: repo });
      const started = Date.now();
      const stdout = execFileSync('node', [GATE], {
        input: JSON.stringify({
          tool_name: 'Bash',
          tool_input: { command: 'git push' },
          cwd: repo,
        }),
        env: {
          ...process.env,
          CLAUDE_PROJECT_DIR: repo,
          PATH: `${stubDir}${path.delimiter}${process.env.PATH}`,
        },
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const elapsed = Date.now() - started;
      const budget = Math.min(...gateEntries.map((e) => e.timeout)) * 1000;
      const made = fs.readFileSync(calls, 'utf8').trim().split('\n');
      assert.equal(made.length, 2, `both git calls must complete, got: ${made.join(' | ')}`);
      assert.match(
        stdout,
        /"permissionDecision":"ask"/,
        'a slow git must still produce the decision',
      );
      assert.ok(elapsed < budget, `gate took ${elapsed} ms, the hook timeout is ${budget} ms`);
    } finally {
      fs.rmSync(stubDir, { recursive: true, force: true });
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});

// The scaffold no longer writes allow or ask rules (DEC-55), so the gate is
// the only Tierward guard on a promotion: inside a block it needs `Promote`,
// outside a block it asks the human. MCP tools that commit a file straight to
// a branch count as a push to that branch.
describe('governance-gate hook — MCP writes and promotions outside a block (DEC-55)', () => {
  const decision = (out) => (out.match(/"permissionDecision":"(\w+)"/) || [])[1] || 'allow';
  const FM = 'block: test\nrequirements_approved: true\npromotion_approved: false';
  const MCP_WRITE_TOOLS = [
    'mcp__github__push_files',
    'mcp__github__create_or_update_file',
    'mcp__github__delete_file',
    'mcp__plugin_github_github__push_files',
  ];
  const write = (toolName, branch, opts) => {
    const toolInput = { owner: 'o', repo: 'r', path: 'a.md', content: 'x', message: 'm' };
    if (branch !== undefined) toolInput.branch = branch;
    return runHook(GATE, { tool_name: toolName, tool_input: toolInput }, opts);
  };

  it('denies an MCP write to a protected branch inside a block without `Promote`', () => {
    for (const tool of MCP_WRITE_TOOLS) {
      for (const branch of ['main', 'staging', 'refs/heads/main']) {
        const { stdout } = write(tool, branch, { sessionFrontMatter: FM });
        assert.equal(decision(stdout), 'deny', `${tool} -> ${branch}`);
        assert.ok(stdout.includes('Promote'), 'deny reason must name the Promote keyword');
      }
    }
  });

  it('treats an MCP write with no branch as a write to a protected branch', () => {
    const { stdout } = write('mcp__github__push_files', undefined, { sessionFrontMatter: FM });
    assert.equal(decision(stdout), 'deny');
  });

  it('allows an MCP write to a protected branch once with `Promote`, then consumes the flag', () => {
    const fm = 'block: test\nrequirements_approved: true\npromotion_approved: true';
    const { stdout, sessionContent } = write('mcp__github__create_or_update_file', 'main', {
      sessionFrontMatter: fm,
    });
    assert.equal(stdout.trim(), '');
    assert.match(sessionContent, /promotion_approved:\s*false/);
  });

  it('allows an MCP write to a work branch, inside or outside a block', () => {
    for (const branch of ['feature/main-nav', 'fix/staging-copy', 'main-backup']) {
      assert.equal(write('mcp__github__push_files', branch, { sessionFrontMatter: FM }).stdout, '');
      assert.equal(write('mcp__github__push_files', branch).stdout, '');
    }
  });

  // The write tools are recognised by what the call carries, not by the
  // server name (DEC-78, F12): a protected `branch`, or the GitHub shape
  // (`owner` and `repo`, whose schema requires `branch`) with no branch. A
  // same-named tool of another server that carries neither is not a promotion.
  it('ignores file tools of other servers that name no branch', () => {
    const calls = [
      ['mcp__drive__delete_file', { fileId: 'abc' }],
      ['mcp__filesystem__create_or_update_file', { path: '/tmp/x', content: 'y' }],
      ['mcp__notes__push_files', { files: [{ path: 'a.md', content: 'x' }], message: 'm' }],
    ];
    for (const [tool, toolInput] of calls) {
      const payload = { tool_name: tool, tool_input: toolInput };
      assert.equal(
        runHook(GATE, payload, { sessionFrontMatter: FM }).stdout,
        '',
        `${tool} in a block`,
      );
      assert.equal(runHook(GATE, payload).stdout, '', `${tool} outside a block`);
    }
  });

  it('gates a write of any server that names a protected branch', () => {
    const gitlab = (branch) =>
      runHook(
        GATE,
        {
          tool_name: 'mcp__gitlab__create_or_update_file',
          tool_input: {
            project_id: '42',
            file_path: 'a.md',
            content: 'x',
            commit_message: 'm',
            branch,
          },
        },
        { sessionFrontMatter: FM },
      );
    assert.equal(decision(gitlab('main').stdout), 'deny');
    assert.equal(decision(gitlab('feature/x').stdout), 'allow');
  });

  it('asks outside a block for every promotion form: push, PR merge, MCP merge, MCP write', () => {
    const bash = (command) => runHook(GATE, { tool_name: 'Bash', tool_input: { command } });
    const cases = {
      'git push origin main': bash('git push origin main'),
      'git push origin HEAD:main': bash('git push origin HEAD:main'),
      'gh pr merge 12 --merge': bash('gh pr merge 12 --merge'),
      mcp__github__merge_pull_request: runHook(GATE, {
        tool_name: 'mcp__github__merge_pull_request',
        tool_input: { owner: 'o', repo: 'r', pullNumber: 12 },
      }),
      'mcp__github__push_files -> main': write('mcp__github__push_files', 'main'),
    };
    for (const [label, { stdout }] of Object.entries(cases)) {
      assert.equal(decision(stdout), 'ask', label);
      assert.ok(stdout.includes('"hookEventName":"PreToolUse"'), label);
    }
  });

  it('stays silent outside a block for commits and work-branch pushes', () => {
    for (const command of ['git commit -m "x"', 'git push -u origin feature/x', 'git status']) {
      const { stdout } = runHook(GATE, { tool_name: 'Bash', tool_input: { command } });
      assert.equal(stdout.trim(), '', command);
    }
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
  // Refspecs that update main without naming it: `:` pushes every branch the
  // remote also has, a glob destination that covers main pushes it too (F4).
  'git push origin :',
  "git push origin 'refs/heads/*:refs/heads/*'",
  "git push origin 'refs/heads/*'",
  "git push origin '+refs/heads/*:refs/heads/*'",
];

const PUSH_STABLE_ALLOW = [
  'git push origin feature/main-nav',
  'git push -u origin fix/bug-123',
  // Globs that cannot cover a protected branch (F4).
  "git push origin 'refs/tags/*:refs/tags/*'",
  "git push origin 'feature/*:feature/*'",
  "git push origin 'refs/heads/feature/*'",
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

// A pull request merge is a promotion in every mode: the `pr` promotion mode
// merges into `main` this way, and an agent could use it to bypass the push gate.
describe('governance-gate hook — pull request merge (D3)', () => {
  const blocked = (out) => out.includes('"permissionDecision":"deny"');
  const FM = 'block: test\nrequirements_approved: true\npromotion_approved: false';
  const bash = (command, fm = FM) =>
    runHook(GATE, { tool_name: 'Bash', tool_input: { command } }, { sessionFrontMatter: fm });
  const mcp = (toolName, fm = FM) =>
    runHook(
      GATE,
      { tool_name: toolName, tool_input: { owner: 'o', repo: 'r', pullNumber: 12 } },
      { sessionFrontMatter: fm },
    );

  const MERGE_MUST_DENY = [
    'gh pr merge 12 --squash',
    'gh pr merge --squash --delete-branch',
    'gh pr merge 12 --merge --auto',
    'gh pr merge -R owner/repo 12 --rebase',
    '/opt/homebrew/bin/gh pr merge 12 --squash',
    'git push -u origin feature/x && gh pr merge 12 --squash',
    "bash -c 'gh pr merge 12 --squash'",
    'gh pr checks 12 --watch && gh pr merge 12 --squash --delete-branch',
  ];
  const MERGE_ALLOW = [
    'gh pr merge 12 --disable-auto',
    'gh pr create --base main --fill',
    'gh pr view 12',
    'gh pr checks 12 --watch',
    'git push -u origin feature/x && gh pr create --base main --fill',
    'git commit -m "gh pr merge comes later"',
    'echo "gh pr merge 12"',
  ];
  const MCP_MERGE_TOOLS = [
    'mcp__github__merge_pull_request',
    'mcp__plugin_github_github__merge_pull_request',
  ];

  it('denies `gh pr merge` without `Promote`, in every command form', () => {
    for (const cmd of MERGE_MUST_DENY) {
      const { stdout } = bash(cmd);
      assert.ok(blocked(stdout) && stdout.includes('Promote'), `must be gated:\n${cmd}`);
    }
  });

  it('allows the PR commands that do not merge, and data that mentions a merge', () => {
    for (const cmd of MERGE_ALLOW) {
      assert.equal(bash(cmd).stdout.trim(), '', `must not be gated:\n${cmd}`);
    }
  });

  it('allows the merge once with `Promote`, then the flag is consumed', () => {
    const fm = 'block: test\nrequirements_approved: true\npromotion_approved: true';
    const { stdout, sessionContent } = bash('gh pr merge 12 --squash --delete-branch', fm);
    assert.equal(stdout.trim(), '', 'authorized merge must pass');
    assert.match(sessionContent, /promotion_approved:\s*false/, 'flag must be consumed');
  });

  it('falls back to the whole-text check when the merge command cannot be parsed', () => {
    assert.ok(blocked(bash('gh pr merge 12 --squash "').stdout));
  });

  it('denies MCP merge tools without `Promote` (server and plugin naming)', () => {
    for (const tool of MCP_MERGE_TOOLS) {
      const { stdout } = mcp(tool);
      assert.ok(blocked(stdout) && stdout.includes('Promote'), `must be gated: ${tool}`);
    }
  });

  it('allows an MCP merge once with `Promote`, then the flag is consumed', () => {
    const fm = 'block: test\nrequirements_approved: true\npromotion_approved: true';
    const { stdout, sessionContent } = mcp('mcp__github__merge_pull_request', fm);
    assert.equal(stdout.trim(), '');
    assert.match(sessionContent, /promotion_approved:\s*false/);
  });

  it('ignores other MCP tools, and asks for a merge without a session file (DEC-55)', () => {
    assert.equal(mcp('mcp__github__create_pull_request').stdout.trim(), '');
    const { stdout } = runHook(GATE, {
      tool_name: 'mcp__github__merge_pull_request',
      tool_input: { pullNumber: 12 },
    });
    assert.ok(stdout.includes('"permissionDecision":"ask"'), stdout);
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
