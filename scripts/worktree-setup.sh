#!/usr/bin/env bash
# worktree-setup.sh <block-name>
#
# Creates a git worktree from origin/staging with the correct branch name and
# symlinks gitignored Claude config files from the main repo so edits to those
# files are reflected live in the worktree without duplication.
#
# Usage (from repo root or any subdirectory):
#   bash scripts/worktree-setup.sh <block-name>
#
# After running, call EnterWorktree(path: "<printed path>") in Claude Code.

set -euo pipefail

if [ $# -eq 0 ] || [[ "$1" == --* ]]; then
  echo "Usage: bash scripts/worktree-setup.sh <block-name>" >&2
  echo "Example: bash scripts/worktree-setup.sh vitepress-docs" >&2
  exit 1
fi
BLOCK_NAME="$1"

# Derive repo root from this script's location (reliable even inside a worktree)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

WORKTREE_PATH="$REPO_ROOT/.claude/worktrees/$BLOCK_NAME"
BRANCH="worktree-$BLOCK_NAME"

# ── Pre-flight checks ──────────────────────────────────────────────────────────

if git -C "$REPO_ROOT" worktree list | grep -q "$WORKTREE_PATH"; then
  echo "ERROR: worktree '$BLOCK_NAME' already exists at $WORKTREE_PATH" >&2
  exit 1
fi

if git -C "$REPO_ROOT" rev-parse --verify "$BRANCH" &>/dev/null; then
  echo "ERROR: branch '$BRANCH' already exists — choose a different block name" >&2
  exit 1
fi

# ── Create worktree from staging ───────────────────────────────────────────────

echo "Fetching origin/staging..."
git -C "$REPO_ROOT" fetch origin staging

echo "Creating worktree '$BLOCK_NAME' on branch '$BRANCH' from origin/staging..."
git -C "$REPO_ROOT" worktree add "$WORKTREE_PATH" -b "$BRANCH" "origin/staging"

# ── Symlink gitignored Claude files ───────────────────────────────────────────
# Only gitignored files are safe to symlink. Tracked files are already present
# in the worktree checkout and must not be symlinked (would dirty git status).

for FILE in CLAUDE.local.md settings.local.json; do
  SRC="$REPO_ROOT/.claude/$FILE"
  DEST="$WORKTREE_PATH/.claude/$FILE"
  if [ -f "$SRC" ]; then
    ln -sf "$SRC" "$DEST"
    echo "✓ symlinked .claude/$FILE"
  fi
done

# Create a worktree-scoped session directory (not shared across worktrees)
mkdir -p "$WORKTREE_PATH/.claude/session"
echo "✓ created .claude/session/"

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "Worktree ready"
echo "  Path:   $WORKTREE_PATH"
echo "  Branch: $BRANCH"
echo "  Base:   origin/staging"
echo ""
echo "Next step in Claude Code:"
echo "  EnterWorktree(path: \"$WORKTREE_PATH\")"
