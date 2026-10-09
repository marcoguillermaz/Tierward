#!/usr/bin/env node
// Audit log hook (Tierward).
// Wired as an async hook on:
//   - PostToolUse (Write|Edit on tier S, Write|Edit|Bash on tier M/L): one JSON line
//     per tool call in ~/.claude/audit/<project>.jsonl
//   - SessionStart (tier L): one line in ~/.claude/audit/sessions.log
//   - InstructionsLoaded (every tier): the hook input as one JSON line in
//     <project>/.claude/logs/instructions-YYYYMMDD.log (gitignored)
//
// WHY: the inline commands this replaces read CLAUDE_TOOL_NAME, CLAUDE_TOOL_INPUT,
// CLAUDE_TOOL_INPUT_FILE_PATH, CLAUDE_SESSION_ID and CLAUDE_MODEL. Claude Code sets
// none of them for hooks, so those logs held timestamps only; the instructions log
// went to a shared, predictable file under /tmp.
//
// Spec reference: https://code.claude.com/docs/en/hooks
//   - input: JSON on stdin (`session_id`, `hook_event_name`, `tool_name`, `tool_input`)
//   - SessionStart may carry `model`, and may omit it (after /clear, on recovery,
//     and in headless runs as observed), so `model=` is written only when present
//
// What gets logged for a tool call is a summary, not the raw input: the command for
// Bash, the file path for Write and Edit. File contents never reach the log.
//
// Never blocks: any error → exit 0 with nothing written. Directories and files it
// creates are readable by the current user only.

import { appendFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const INPUT_MAX = 300;

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
  });
}

function timestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function localDate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function append(file, line) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  appendFileSync(file, `${line}\n`, { mode: 0o600 });
}

function summarize(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return '';
  if (typeof toolInput.command === 'string') return toolInput.command;
  if (typeof toolInput.file_path === 'string') return toolInput.file_path;
  return JSON.stringify(toolInput);
}

async function main() {
  let input;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    return;
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return;

  const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const auditDir = path.join(os.homedir(), '.claude', 'audit');

  switch (input.hook_event_name) {
    case 'PostToolUse':
      append(
        path.join(auditDir, `${path.basename(projectDir)}.jsonl`),
        JSON.stringify({
          timestamp: timestamp(),
          session: input.session_id || '',
          tool: input.tool_name || '',
          input: summarize(input.tool_input).slice(0, INPUT_MAX),
        }),
      );
      break;
    case 'SessionStart': {
      const model = typeof input.model === 'string' && input.model ? ` model=${input.model}` : '';
      append(
        path.join(auditDir, 'sessions.log'),
        `${timestamp()} SESSION_START project=${path.basename(projectDir)}${model}`,
      );
      break;
    }
    case 'InstructionsLoaded':
      append(
        path.join(projectDir, '.claude', 'logs', `instructions-${localDate()}.log`),
        JSON.stringify(input),
      );
      break;
    default:
      break;
  }
}

main()
  .catch(() => {})
  .finally(() => process.exit(0));
