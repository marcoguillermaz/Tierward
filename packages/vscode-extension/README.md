# Claude Dev Kit — VS Code extension

Editor-native governance surfaces for [claude-dev-kit](https://github.com/marcoguillermaz/claude-dev-kit). Claude Code's native VS Code extension is chat-centric and exposes no public extension API, so governance data — doctor health, the skill/rule registry, audit findings — never reaches the editor's own surfaces. This extension fills that gap with tree views, status-bar indicators, and Problems-panel diagnostics.

> **Status:** P0 scaffold. The only working command today is `Claude Dev Kit: Run Doctor Report`. Tree view, status bar, diagnostics, and codelens land in later phases.

## How it works

The extension shells out to your installed `claude-dev-kit` CLI (the same approach the CDK MCP server uses) and renders the results in VS Code. It runs no governance logic of its own — the CLI stays the single source of truth.

## Requirements

- The `claude-dev-kit` CLI on your `PATH`, or set `cdk.cliPath` to its absolute path.
- A workspace folder that contains a `.claude/` directory.

## Settings

| Setting | Default | Description |
|---|---|---|
| `cdk.cliPath` | `claude-dev-kit` | Command used to invoke the CLI. |

## Development

```bash
npm install
npm run compile     # esbuild → dist/extension.js
npm run typecheck   # tsc --noEmit
npm test            # node --test on the backend
```

Press `F5` from this folder to launch an Extension Development Host with the extension loaded.
