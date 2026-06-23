#!/usr/bin/env bash
# Usage: ./new-worktree.sh <feat|fix|chore> <slug>
# Creates a git worktree in a sibling directory with a branch off origin/staging.
set -euo pipefail

TYPE=${1:-}
SLUG=${2:-}

if [[ -z "$TYPE" || -z "$SLUG" ]]; then
  echo "Usage: $0 <feat|fix|chore> <slug>" >&2
  exit 1
fi

if [[ ! "$TYPE" =~ ^(feat|fix|chore)$ ]]; then
  echo "Error: type must be feat, fix, or chore" >&2
  exit 1
fi

BRANCH="${TYPE}/${SLUG}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
REPO_NAME="$(basename "$REPO_ROOT")"
WORKTREE_DIR="${REPO_ROOT}/../${REPO_NAME}-${SLUG}"

git fetch origin staging

if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
  echo "Branch '${BRANCH}' already exists locally — attaching worktree to it."
  git worktree add "${WORKTREE_DIR}" "${BRANCH}"
else
  git worktree add "${WORKTREE_DIR}" -b "${BRANCH}" origin/staging
fi

echo ""
echo "Worktree: ${WORKTREE_DIR}"
echo "Branch:   ${BRANCH}"
echo ""
echo "To open in a new Claude Code session:"
echo "  claude \"${WORKTREE_DIR}\""
