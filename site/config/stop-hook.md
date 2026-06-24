# Stop hook

The Stop hook runs every time Claude tries to mark a task as complete and blocks that completion until your test suite passes. It's wired into Claude Code at the OS level — Claude cannot declare done. That choice belongs to your tests.

## How it works

The Stop hook is a `Stop` entry in `.claude/settings.json`. When Claude finishes a task, Claude Code runs the hook command. If the command exits non-zero, Claude Code blocks the completion and shows the output to Claude. Claude must fix the issue and try again.

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npm test || echo '{\"decision\": \"block\", \"reason\": \"Tests must pass before marking done.\"}'",
            "timeout": 300
          }
        ]
      }
    ]
  }
}
```

## Timeout

The `timeout` field (in seconds) prevents Claude from hanging indefinitely when a test command gets stuck. All tiers include `"timeout": 300` (5 minutes) by default.

If your test suite takes longer, increase the value. If `doctor` warns about a missing timeout, add `"timeout": 300` to the hook entry.

## Customizing the test command

Replace the test command with whatever validates your project:

```json
"command": "pytest || echo '{\"decision\": \"block\", \"reason\": \"Tests must pass.\"}'"
```

```json
"command": "go test ./... || echo '{\"decision\": \"block\", \"reason\": \"Tests must pass.\"}'"
```

```json
"command": "bundle exec rspec || echo '{\"decision\": \"block\", \"reason\": \"Tests must pass.\"}'"
```

The `echo` at the end is required. It tells Claude Code that this is a deliberate block (not a command error) and provides the reason shown to Claude.

## Verifying your hook

```bash
npx tierward doctor
```

Doctor checks that the Stop hook is present, that `[TEST_COMMAND]` has been replaced, and that `timeout` is set. A clean `doctor` output means your hook is correctly configured.

## Why this matters

Without enforcement, the quality contract between Claude and your team is advisory. Claude can decide tests are "good enough" or skip them under time pressure. The Stop hook removes that discretion: tests either pass or the task stays open.

In practice, teams that add this hook report fewer regressions slipping through on tasks where Claude was left to self-certify.
