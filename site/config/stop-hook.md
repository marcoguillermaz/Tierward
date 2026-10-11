# Stop hook

The Stop hook runs every time Claude tries to mark a task as complete. If your test suite fails, it blocks that stop and Claude goes back to fix the failure. It is wired into Claude Code, not into the prompt, so Claude cannot talk its way past the first check. Whether that first stop succeeds is decided by your tests.

## How it works

The Stop hook is a `Stop` entry in `.claude/settings.json`. When Claude finishes a task, Claude Code runs the hook command. If the tests fail, the hook prints a block decision, Claude Code keeps the task open and shows the reason to Claude, and Claude keeps working.

If Claude stops again in the same turn, Claude Code marks the stop as a retry (`stop_hook_active` in the JSON it passes to the hook on stdin) and the hook lets it through. A failure Claude cannot fix therefore does not turn into a loop, and the failing output is already in the conversation for you to review.

This is the tier S hook for a Node.js project with `npx vitest run` as test command:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "cat 2>/dev/null | grep -q '\"stop_hook_active\": *true' && exit 0; [ ! -f package.json ] && exit 0; OUT=$(npx vitest run 2>&1); CODE=$?; [ \"$CODE\" -ne 0 ] && { echo \"$OUT\" >&2; echo '{\"decision\": \"block\", \"reason\": \"Tests must pass before declaring complete.\"}'; }; exit 0",
            "timeout": 300
          }
        ]
      }
    ]
  }
}
```

The `[ ! -f package.json ]` check skips the gate in a new repository that has no test setup yet. Tier M and L also move to the project directory first.

## Timeout

The `timeout` field (in seconds) prevents Claude from hanging indefinitely when a test command gets stuck. All tiers include `"timeout": 300` (5 minutes) by default.

If your test suite takes longer, increase the value. If `doctor` warns about a missing timeout, add `"timeout": 300` to the hook entry.

Tierward does not set Claude Code's `onFailure: "block"` on this hook: if the hook times out, the stop goes through. With `onFailure: "block"`, a suite slower than the timeout would block every stop.

## Customizing the test command

`init` writes your test command into the hook. To change it later, edit the part inside `OUT=$(...)`, for example `OUT=$(pytest 2>&1)`, `OUT=$(go test ./... 2>&1)` or `OUT=$(bundle exec rspec 2>&1)`.

Keep the rest of the command as it is. The hook must exit 0 and print only the block decision on stdout, with the test output on stderr: if test output reaches stdout, Claude Code cannot parse the decision and the block is lost.

## Verifying your hook

```bash
npx tierward doctor
```

Doctor checks that the Stop hook is present, that `[TEST_COMMAND]` has been replaced, and that `timeout` is set. A clean `doctor` output means your hook is correctly configured.

## Why this matters

Without enforcement, the quality contract between Claude and your team is advisory. Claude can decide tests are "good enough" or skip them under time pressure. The Stop hook removes that discretion: when the tests fail, Claude is sent back to them before it can call the task done.

In practice, teams that add this hook report fewer regressions slipping through on tasks where Claude was left to self-certify.
