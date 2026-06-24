# team-settings.json

`team-settings.json` (v1.16+) is an optional file that lets a tech lead set org-wide policy for skill and tier usage. When present in `.claude/`, Tierward enforces it at runtime via the PreToolUse hook — no model discretion involved.

```
.claude/team-settings.json
```

## Schema

```json
{
  "minTier": "m",
  "required": ["security-audit", "arch-audit"],
  "blocked": ["context-review"],
  "prReviewSeverity": "major"
}
```

| Field | Type | Purpose |
|---|---|---|
| `minTier` | `"0"` \| `"s"` \| `"m"` \| `"l"` | Minimum tier allowed in this project. Claude cannot work below this tier. |
| `required` | `string[]` | Skills that must run before a task is marked done. |
| `blocked` | `string[]` | Skills that are not allowed to run in this project. |
| `prReviewSeverity` | `"critical"` \| `"major"` \| `"minor"` | Minimum severity threshold for `/pr-review` to block a PR. |

All fields are optional. An empty object `{}` is valid and has no effect.

## Enforcement

The PreToolUse hook reads `team-settings.json` before every tool call. If a blocked skill is invoked, the hook returns `decision: block` before the skill executes. If `minTier` is set and the current project tier is lower, the hook blocks the session and explains the mismatch.

This enforcement runs in the hook layer — outside Claude's context — so it cannot be reasoned around or overridden by model output.

## MCP access

When the Tierward MCP server is running, `team-settings.json` is readable via `tierward_team_settings`:

```json
{
  "mcpServers": {
    "tierward": { "command": "tierward-mcp" }
  }
}
```

This lets any MCP-aware client (Claude Desktop, Cursor, VS Code) read the team policy without running the Tierward CLI.

## Example: enforcing security audit before deploy

```json
{
  "minTier": "s",
  "required": ["security-audit"],
  "prReviewSeverity": "critical"
}
```

With this config:
- Tier 0 is not allowed in this project
- `/security-audit` must run before Claude marks any task done
- `/pr-review` only blocks on Critical findings (Major and Minor are surfaced but do not block)
