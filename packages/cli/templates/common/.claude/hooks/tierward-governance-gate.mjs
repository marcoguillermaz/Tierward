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
// Fail-open: no input or no active session file → allow. A misconfigured project
// never has commits blocked spuriously; worst case is the pre-v1.34 status quo
// (no governance gate). A command the parser cannot read falls back to the
// whole-text check below, not to allow.

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const SESSION_DIR = path.join(PROJECT_DIR, '.claude', 'session');

// Protected branches. Keep this the only literal of its kind in the file: the
// scaffold narrows it to `main` on projects that promote straight to main.
const PROTECTED = '(staging|main)';

// The gate reads the commands a Bash call runs, not its text. A `git push` is a
// promotion when an argument names a protected branch (`staging` or `main`) as a standalone token,
// a `refs/heads/` ref, or a refspec destination (`HEAD:main`, `+main`), so
// `feature/main-nav` and `main:feature/x` never match. The pipeline's promotion
// commands are compound (`git checkout staging && git merge … && git push origin staging`),
// so every simple command is checked, not just the first. Quoted strings,
// heredoc bodies and comments are data: a commit message that mentions a push
// is not a push. `$(...)` and backticks, also inside double quotes, and the
// script of `bash -c` are commands and are checked. A `git` word anywhere in a
// simple command counts, so wrappers (`env`, `xargs`, `sudo`) do not hide it.
// Known limitations: a bare `git push` while checked out on a protected branch
// is not detected (the pipeline's prose gate, "promotion is never automatic",
// still covers it), and neither is a substitution inside an unquoted heredoc.
const PROTECTED_BRANCH_RE = new RegExp(`^(?:refs/heads/)?${PROTECTED}$`);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);
const GIT_OPTIONS_WITH_VALUE = new Set([
  '-C',
  '-c',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--super-prefix',
  '--config-env',
]);
const MAX_DEPTH = 16;

// The v2.0.1 whole-text check, used when a command cannot be parsed.
const FALLBACK_PUSH_RE = /\bgit\s+([^\n]*\s)?push(\s|$)/;
const FALLBACK_PROTECTED_RE = new RegExp(`(^|[\\s:'"])${PROTECTED.replace('(', '(?:')}(?=$|[\\s:'".])`);
const FALLBACK_COMMIT_RE = /\bgit\s+([^\n]*\s)?commit(\s|$)/;

// Splits shell source into simple commands (arrays of words, quotes removed),
// starting at `start` and stopping after `closer` (`)` or a backtick) when
// given. Commands inside `$(...)` and backticks are returned alongside the
// outer ones; the substitution itself becomes an opaque word fragment.
// Heredoc bodies are skipped. Throws past MAX_DEPTH nested substitutions and
// on input bash would not run as written (an unterminated quote, substitution
// or heredoc), so the caller judges it with the whole-text check.
function parse(src, start, closer, depth) {
  if (depth > MAX_DEPTH) throw new Error('command nesting too deep');
  const commands = [];
  const heredocs = [];
  let words = [];
  let word = null; // null: no word in progress; '' is an empty quoted word
  let parens = 0;
  let i = start;

  const add = (text) => {
    word = (word ?? '') + text;
  };
  const endWord = () => {
    if (word !== null) words.push(word);
    word = null;
  };
  const endCommand = () => {
    endWord();
    if (words.length > 0) commands.push(words);
    words = [];
  };
  const substitution = (from, close) => {
    const inner = parse(src, from, close, depth + 1);
    commands.push(...inner.commands);
    add('\0');
    return inner.pos;
  };
  const doubleQuoted = (from) => {
    let j = from;
    add('');
    while (j < src.length && src[j] !== '"') {
      if (src[j] === '\\' && j + 1 < src.length) {
        add(src[j + 1]);
        j += 2;
      } else if (src[j] === '$' && src[j + 1] === '(') {
        j = substitution(j + 2, ')');
      } else if (src[j] === '`') {
        j = substitution(j + 1, '`');
      } else {
        add(src[j]);
        j += 1;
      }
    }
    if (j >= src.length) throw new Error('unterminated double quote');
    return j + 1;
  };
  // Heredoc delimiter after `<<` or `<<-`: a bare or quoted word.
  const heredocTag = (from) => {
    let j = from;
    let tag = '';
    while (j < src.length && /[ \t]/.test(src[j])) j += 1;
    while (j < src.length && !/[\s;&|<>()]/.test(src[j])) {
      if (src[j] === "'" || src[j] === '"') {
        const end = src.indexOf(src[j], j + 1);
        const stop = end === -1 ? src.length : end;
        tag += src.slice(j + 1, stop);
        j = stop + 1;
      } else {
        if (src[j] !== '\\') tag += src[j];
        j += 1;
      }
    }
    return { tag, pos: j };
  };
  // Skips the bodies of pending heredocs, starting at the line after `<<TAG`.
  const skipHeredocs = (from) => {
    let j = from;
    for (const { tag, tabs } of heredocs.splice(0)) {
      let closed = false;
      while (j < src.length && !closed) {
        const nl = src.indexOf('\n', j);
        const lineEnd = nl === -1 ? src.length : nl;
        const line = src.slice(j, lineEnd);
        j = lineEnd + 1;
        closed = (tabs ? line.replace(/^\t+/, '') : line) === tag;
      }
      if (!closed) throw new Error('unterminated heredoc');
    }
    return Math.min(j, src.length);
  };

  while (i < src.length) {
    const c = src[i];
    if (closer && parens === 0 && c === closer) {
      endCommand();
      return { commands, pos: i + 1 };
    }
    if (c === '\\') {
      if (src[i + 1] !== '\n' && i + 1 < src.length) add(src[i + 1]);
      i += 2;
    } else if (c === "'") {
      const end = src.indexOf("'", i + 1);
      if (end === -1) throw new Error('unterminated single quote');
      add(src.slice(i + 1, end));
      i = end + 1;
    } else if (c === '"') {
      i = doubleQuoted(i + 1);
    } else if (c === '$' && (src[i + 1] === "'" || src[i + 1] === '"')) {
      i += 1; // `$'...'` and `$"..."`: the quoted text is the word
    } else if (c === '$' && src[i + 1] === '(') {
      i = substitution(i + 2, ')');
    } else if (c === '`') {
      i = substitution(i + 1, '`');
    } else if (c === '#' && word === null) {
      while (i < src.length && src[i] !== '\n') i += 1;
    } else if (c === '\n') {
      endCommand();
      i = skipHeredocs(i + 1);
    } else if (c === ' ' || c === '\t') {
      endWord();
      i += 1;
    } else if (c === ';' || c === '&' || c === '|') {
      endCommand();
      i += 1;
    } else if (c === '(' || c === ')') {
      endCommand();
      if (c === '(') parens += 1;
      else if (parens > 0) parens -= 1;
      i += 1;
    } else if (c === '<' && src[i + 1] === '<' && src[i + 2] === '<') {
      endWord(); // here-string: the next word is parsed as an argument
      i += 3;
    } else if (c === '<' && src[i + 1] === '<') {
      endWord();
      const tabs = src[i + 2] === '-';
      const { tag, pos } = heredocTag(i + (tabs ? 3 : 2));
      heredocs.push({ tag, tabs });
      i = pos;
    } else if (c === '<' || c === '>') {
      endWord(); // redirection operator, including `2>&1`, `>|`, `<&-`
      i += 1;
      while (i < src.length && /[<>&|-]/.test(src[i])) i += 1;
    } else {
      add(c);
      i += 1;
    }
  }
  if (closer) throw new Error('unterminated substitution');
  if (heredocs.length > 0) throw new Error('unterminated heredoc');
  endCommand();
  return { commands, pos: i };
}

// A `git push` argument that targets a protected branch.
function namesProtectedBranch(arg) {
  if (arg.startsWith('-')) return false;
  const ref = arg.replace(/^\+/, '');
  return PROTECTED_BRANCH_RE.test(ref.slice(ref.lastIndexOf(':') + 1));
}

// { push, commit }: whether the command runs a promotion push or a commit.
function analyze(command, depth) {
  const found = { push: false, commit: false };
  for (const words of parse(command, 0, null, depth).commands) {
    words.forEach((w, k) => {
      const name = path.basename(w);
      if (name === 'git') {
        let n = k + 1;
        while (n < words.length && words[n].startsWith('-')) {
          n += GIT_OPTIONS_WITH_VALUE.has(words[n]) ? 2 : 1;
        }
        if (words[n] === 'commit') found.commit = true;
        if (words[n] === 'push' && words.slice(n + 1).some(namesProtectedBranch)) {
          found.push = true;
        }
      } else if (SHELLS.has(name)) {
        let n = k + 1;
        while (n < words.length && words[n].startsWith('-') && !/^-[a-z]*c[a-z]*$/i.test(words[n])) {
          n += 1;
        }
        if (n + 1 < words.length && /^-[a-z]*c[a-z]*$/i.test(words[n])) {
          const inner = analyze(words[n + 1], depth + 1);
          found.push ||= inner.push;
          found.commit ||= inner.commit;
        }
      }
    });
  }
  return found;
}

function inspect(command) {
  try {
    return analyze(command, 0);
  } catch {
    return {
      push: FALLBACK_PUSH_RE.test(command) && FALLBACK_PROTECTED_RE.test(command),
      commit: FALLBACK_COMMIT_RE.test(command),
    };
  }
}

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
    const { push, commit } = inspect(command);

    // Promotion gate first (stricter): a push naming a protected branch.
    if (push) {
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

    if (!commit) process.exit(0); // not a commit → allow

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
