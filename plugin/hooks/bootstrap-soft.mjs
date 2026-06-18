#!/usr/bin/env node
// UserPromptSubmit hook — soft bootstrap reminder for the Tierward plugin.
// Injects a compact reminder about available /tierward:* skills into the
// system context on every prompt. Non-blocking; always exits 0.

async function main() {
  let stdin = '';
  try {
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) stdin += chunk;
  } catch {
    // ignore — stdin unavailable in some environments
  }

  const reminder = [
    'Tierward skills available in this session:',
    '  /tierward:commit         Conventional Commits enforcer — stage changes, then invoke',
    '  /tierward:arch-audit     Claude Code architecture compliance audit',
    '  /tierward:security-audit Auth, input validation, secrets, HTTP headers',
    '  /tierward:perf-audit     Bundle size, caching, N+1 queries, image optimization',
    '  /tierward:simplify       Complexity and duplication scan on changed files',
    '  /tierward:skill-dev      Code quality audit — coupling, dead exports, antipatterns',
    '  /tierward:skill-security SkillSpector vulnerability scan for Claude Code skills',
    '  /tierward:humanize       Remove AI writing patterns from prose (EN + IT)',
  ].join('\n');

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalSystemPrompt: reminder,
      },
    }),
  );

  process.exit(0);
}

main().catch(() => process.exit(0));
