#!/bin/bash
# Read-only classification of local git branches and worktrees for the
# repo-hygiene skill. Prints one section per category; the caller (the
# skill, running in the main conversation) interprets the output and builds
# the AskUserQuestion confirmation batch. This script NEVER deletes anything.
#
# A branch is only a delete candidate if it is merged into EVERY protected
# branch that exists on origin, AND (if it has a worktree) that worktree's
# working tree is clean, AND it has no open PR. Everything else is KEEP,
# no exceptions - this script does not try to be clever about "probably fine".

set -u
cd "$(git rev-parse --show-toplevel)" || exit 1

PROTECTED_BRANCHES="main staging"

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
git fetch origin --quiet 2>/dev/null

# Only consider protected branches that actually exist on origin.
ACTIVE_PROTECTED=""
for p in $PROTECTED_BRANCHES; do
  if git rev-parse --verify --quiet "origin/$p" >/dev/null; then
    ACTIVE_PROTECTED="$ACTIVE_PROTECTED $p"
  fi
done
if [ -z "$ACTIVE_PROTECTED" ]; then
  echo "ERROR: none of the protected branches ($PROTECTED_BRANCHES) exist on origin" >&2
  exit 1
fi

is_merged_all() {
  local b="$1" p
  for p in $ACTIVE_PROTECTED; do
    git branch --merged "origin/$p" 2>/dev/null | sed 's/^[* +]*//' | grep -qxF "$b" || return 1
  done
  return 0
}

# Exit codes: 0 = open PR exists, 1 = confirmed no open PR, 2 = check failed (unknown).
# A `gh` failure (auth, network, rate limit, gh not installed) must NOT be read as
# "no PR" - that would let this script report a branch as safe to delete when it
# simply could not verify.
has_open_pr() {
  local b="$1"
  local output
  output=$(gh pr list --state open --head "$b" --json number --jq 'length' 2>/dev/null)
  local exit_code=$?
  if [ "$exit_code" -ne 0 ] || ! [[ "$output" =~ ^[0-9]+$ ]]; then
    return 2
  fi
  [ "$output" -gt 0 ] && return 0
  return 1
}

is_protected() {
  local b="$1" p
  for p in $PROTECTED_BRANCHES; do
    [ "$b" = "$p" ] && return 0
  done
  return 1
}

echo "=== SAFE_BRANCH_DELETE (no worktree, merged into all protected branches, no open PR) ==="
git branch -vv | sed 's/^[* +]*//' | while read -r line; do
  b=$(echo "$line" | awk '{print $1}')
  [ "$b" = "$CURRENT_BRANCH" ] && continue
  is_protected "$b" && continue
  # skip branches that have a worktree attached (handled in the next section)
  git worktree list | grep -qF -- "[$b]" && continue
  if is_merged_all "$b"; then
    has_open_pr "$b"
    pr_status=$?
    if [ "$pr_status" -eq 2 ]; then
      echo "KEEP|$b|gh PR check failed - treat as unknown, do not assume no PR"
    elif [ "$pr_status" -eq 0 ]; then
      echo "KEEP|$b|open PR exists"
    else
      echo "$b"
    fi
  fi
done

echo
echo "=== SAFE_WORKTREE_REMOVE (has worktree, merged into all protected branches, clean, no open PR) ==="
# Detached-HEAD worktrees (porcelain "detached" line instead of "branch") never appear
# here - the awk filter below only fires on "/^branch /". Fails safe (nothing gets
# misclassified as safe), but is a silent coverage gap: a detached worktree is simply
# never reported at all, safe or not.
# NOTE: the loop variable is deliberately NOT named "path" - in zsh the scalar $PATH
# is tied to a special array $path, and this script may be sourced or adapted there;
# keeping the name wtpath avoids clobbering $PATH in that shell.
git worktree list --porcelain | awk '/^worktree /{wt=$2} /^branch /{print wt"|"$2}' | while IFS='|' read -r wtpath branchref; do
  b=${branchref#refs/heads/}
  [ "$wtpath" = "$(git rev-parse --show-toplevel)" ] && continue
  if is_merged_all "$b"; then
    dirty=$(git -C "$wtpath" status --porcelain 2>/dev/null)
    if [ -n "$dirty" ]; then
      echo "KEEP|$b|$wtpath|uncommitted changes present"
    else
      has_open_pr "$b"
      pr_status=$?
      if [ "$pr_status" -eq 2 ]; then
        echo "KEEP|$b|$wtpath|gh PR check failed - treat as unknown, do not assume no PR"
      elif [ "$pr_status" -eq 0 ]; then
        echo "KEEP|$b|$wtpath|open PR exists"
      else
        echo "$b|$wtpath"
      fi
    fi
  else
    echo "KEEP|$b|$wtpath|not yet merged into all protected branches"
  fi
done

echo
echo "=== PRUNABLE_WORKTREE (registered but working directory no longer exists) ==="
git worktree list --porcelain | awk '/^worktree /{wt=$2} /^prunable/{print wt}'

echo
echo "=== DONE ==="

echo
echo "=== ORPHAN_WORKTREE_DIR (on disk under .claude/worktrees/ but NOT registered) ==="
# A dir left behind after a failed/manual removal + prune. Git cannot report
# dirtiness for an unregistered dir - the caller must show a content summary
# and gate any rm -rf behind its own, separate confirmation.
if [ -d ".claude/worktrees" ]; then
  REGISTERED=$(git worktree list --porcelain | awk '/^worktree /{print $2}')
  for d in .claude/worktrees/*/; do
    [ -d "$d" ] || continue
    abs=$(cd "$d" && pwd)
    if ! echo "$REGISTERED" | grep -qxF "$abs"; then
      files=$(find "$d" -type f 2>/dev/null | wc -l | tr -d ' ')
      newest=$(find "$d" -type f -exec stat -f '%Sm' -t '%Y-%m-%d' {} + 2>/dev/null | sort -r | head -1)
      echo "$d|files:$files|newest:${newest:-n/a}"
    fi
  done
fi

echo
echo "=== SCAN_COMPLETE ==="
