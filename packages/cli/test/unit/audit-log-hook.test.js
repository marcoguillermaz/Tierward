// Regression suite for the logging hook (tierward-audit-log.mjs).
//
// The hook replaces inline shell commands that read CLAUDE_TOOL_NAME,
// CLAUDE_TOOL_INPUT, CLAUDE_TOOL_INPUT_FILE_PATH, CLAUDE_SESSION_ID and
// CLAUDE_MODEL. Claude Code sets none of them for hooks: session and tool data
// arrive as JSON on stdin (code.claude.com/docs/en/hooks), so those logs recorded
// timestamps only. These tests feed the stdin shapes observed from Claude Code
// (session_id, tool_name, tool_input; SessionStart with and without `model`;
// InstructionsLoaded with file_path/memory_type/load_reason) and check what lands
// on disk, with HOME and the project dir isolated in a temp directory.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.resolve(__dirname, '../../templates/common/.claude/hooks/tierward-audit-log.mjs');

// Run the hook once with `stdin` (an object is JSON-encoded, a string is sent as is)
// in a fresh temp HOME and project dir. Returns the paths so a test can read what
// was written; the temp root is removed by the caller through `cleanup`.
function runHook(stdin, { env = {}, projectName = 'demo-app' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-audit-'));
  const home = path.join(root, 'home');
  const project = path.join(root, projectName);
  fs.mkdirSync(home);
  fs.mkdirSync(project);
  const result = execFileSync('node', [HOOK], {
    input: typeof stdin === 'string' ? stdin : JSON.stringify(stdin),
    env: { ...process.env, HOME: home, CLAUDE_PROJECT_DIR: project, ...env },
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return {
    stdout: result,
    home,
    project,
    auditDir: path.join(home, '.claude', 'audit'),
    jsonl: path.join(home, '.claude', 'audit', `${projectName}.jsonl`),
    sessionsLog: path.join(home, '.claude', 'audit', 'sessions.log'),
    logsDir: path.join(project, '.claude', 'logs'),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

function readLines(file) {
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
}

const SESSION = '82616602-a48f-4dba-b848-9c9697e6c665';

function postToolUse(tool_name, tool_input) {
  return {
    session_id: SESSION,
    cwd: '/somewhere/else',
    hook_event_name: 'PostToolUse',
    tool_name,
    tool_input,
    tool_response: { ok: true },
  };
}

describe('audit-log hook: PostToolUse', () => {
  it('logs an Edit with its file path, tool name and session from stdin', () => {
    const r = runHook(
      postToolUse('Edit', {
        file_path: '/repo/src/app.ts',
        old_string: 'alpha',
        new_string: 'beta',
        replace_all: false,
      }),
    );
    try {
      const lines = readLines(r.jsonl);
      assert.equal(lines.length, 1);
      const entry = JSON.parse(lines[0]);
      assert.equal(entry.tool, 'Edit');
      assert.equal(entry.session, SESSION);
      assert.equal(entry.input, '/repo/src/app.ts');
      assert.match(entry.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    } finally {
      r.cleanup();
    }
  });

  it('logs a Write by path and never copies the file content into the log', () => {
    const r = runHook(
      postToolUse('Write', { file_path: '/repo/.env.example', content: 'API_KEY=secret-value' }),
    );
    try {
      const raw = fs.readFileSync(r.jsonl, 'utf8');
      assert.equal(JSON.parse(raw.trim()).input, '/repo/.env.example');
      assert.doesNotMatch(raw, /secret-value/);
    } finally {
      r.cleanup();
    }
  });

  it('logs a Bash command, cut to 300 characters', () => {
    const command = `echo ${'x'.repeat(400)}`;
    const r = runHook(postToolUse('Bash', { command, description: 'long echo' }));
    try {
      const entry = JSON.parse(readLines(r.jsonl)[0]);
      assert.equal(entry.tool, 'Bash');
      assert.equal(entry.input, command.slice(0, 300));
    } finally {
      r.cleanup();
    }
  });

  it('appends one line per call to the same per-project file', () => {
    const r = runHook(postToolUse('Bash', { command: 'npm test' }));
    try {
      execFileSync('node', [HOOK], {
        input: JSON.stringify(postToolUse('Write', { file_path: '/repo/a.md', content: 'a' })),
        env: { ...process.env, HOME: r.home, CLAUDE_PROJECT_DIR: r.project },
        encoding: 'utf8',
      });
      const tools = readLines(r.jsonl).map((l) => JSON.parse(l).tool);
      assert.deepEqual(tools, ['Bash', 'Write']);
    } finally {
      r.cleanup();
    }
  });

  it('ignores the undocumented CLAUDE_TOOL_* variables and reads stdin only', () => {
    const r = runHook(postToolUse('Edit', { file_path: '/repo/real.ts' }), {
      env: {
        CLAUDE_TOOL_NAME: 'Bogus',
        CLAUDE_TOOL_INPUT: '{"file_path":"/bogus"}',
        CLAUDE_TOOL_INPUT_FILE_PATH: '/bogus',
        CLAUDE_SESSION_ID: 'bogus-session',
      },
    });
    try {
      const entry = JSON.parse(readLines(r.jsonl)[0]);
      assert.equal(entry.tool, 'Edit');
      assert.equal(entry.input, '/repo/real.ts');
      assert.equal(entry.session, SESSION);
    } finally {
      r.cleanup();
    }
  });

  it('creates the audit directory and file private to the user', () => {
    const r = runHook(postToolUse('Bash', { command: 'ls' }));
    try {
      assert.equal(fs.statSync(r.auditDir).mode & 0o777, 0o700);
      assert.equal(fs.statSync(r.jsonl).mode & 0o777, 0o600);
    } finally {
      r.cleanup();
    }
  });
});

describe('audit-log hook: SessionStart', () => {
  it('writes model= when the input carries a model', () => {
    const r = runHook({
      session_id: SESSION,
      hook_event_name: 'SessionStart',
      source: 'startup',
      model: 'claude-sonnet-5-5',
    });
    try {
      const lines = readLines(r.sessionsLog);
      assert.equal(lines.length, 1);
      assert.match(
        lines[0],
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z SESSION_START project=demo-app model=claude-sonnet-5-5$/,
      );
    } finally {
      r.cleanup();
    }
  });

  it('writes no model= at all when the input has none (headless runs, /clear)', () => {
    const r = runHook(
      { session_id: SESSION, hook_event_name: 'SessionStart', source: 'startup' },
      { env: { CLAUDE_MODEL: 'bogus-model' } },
    );
    try {
      const line = readLines(r.sessionsLog)[0];
      assert.match(line, /SESSION_START project=demo-app$/);
      assert.doesNotMatch(line, /model=/);
    } finally {
      r.cleanup();
    }
  });
});

describe('audit-log hook: InstructionsLoaded', () => {
  it('appends the input as one JSON line under the project .claude/logs/', () => {
    const input = {
      session_id: SESSION,
      hook_event_name: 'InstructionsLoaded',
      file_path: '/repo/CLAUDE.md',
      memory_type: 'Project',
      load_reason: 'session_start',
    };
    const r = runHook(input);
    try {
      const files = fs.readdirSync(r.logsDir);
      assert.equal(files.length, 1);
      assert.match(files[0], /^instructions-\d{8}\.log$/);
      const logFile = path.join(r.logsDir, files[0]);
      assert.deepEqual(JSON.parse(readLines(logFile)[0]), input);
      assert.equal(fs.statSync(logFile).mode & 0o777, 0o600);
      assert.equal(fs.existsSync(r.auditDir), false, 'nothing written under ~/.claude/audit');
    } finally {
      r.cleanup();
    }
  });
});

describe('audit-log hook: fail-open', () => {
  it('exits 0 and writes nothing on empty or invalid stdin', () => {
    for (const stdin of ['', 'not json', '[]']) {
      const r = runHook(stdin);
      try {
        assert.equal(r.stdout, '');
        assert.equal(fs.existsSync(r.auditDir), false);
        assert.equal(fs.existsSync(r.logsDir), false);
      } finally {
        r.cleanup();
      }
    }
  });

  it('exits 0 and writes nothing for an event it does not log', () => {
    const r = runHook({ session_id: SESSION, hook_event_name: 'Stop' });
    try {
      assert.equal(fs.existsSync(r.auditDir), false);
      assert.equal(fs.existsSync(r.logsDir), false);
    } finally {
      r.cleanup();
    }
  });
});
