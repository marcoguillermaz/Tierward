#!/usr/bin/env bash
#
# release-sha-followup.sh
#
# Post-promotion release step. Run AFTER the release promotion PR
# (staging → main) has merged: at that point origin/main is the release
# merge commit, which is what marketplace.json plugins[0].source.sha must
# point at. Running earlier reproduces the sha lag this script exists to
# prevent (marketplace advertising the new version while the sha still
# serves the previous release).
#
# What it does, codifying the manual #404/#405 pattern:
#   1. fetch origin, verify staging has nothing unpromoted (the sha must
#      target a release merge, not an intermediate state of main)
#   2. branch fix/release-sha-<version> from origin/staging
#   3. node scripts/sync-plugin-version.mjs --sha
#   4. commit, push, open a PR to staging; the auto-merge workflow
#      squash-merges it once checks pass
#   5. remind the operator to run tw-pr for the promotion to main
set -euo pipefail

cd "$(dirname "$0")/.."

git fetch origin

if [[ -n "$(git log origin/main..origin/staging --oneline)" ]]; then
  echo "Error: staging has commits not yet promoted to main." >&2
  echo "Promote staging first (tw-pr), then re-run this script." >&2
  exit 1
fi

VERSION=$(node -p "require('./packages/cli/package.json').version")
BRANCH="fix/release-sha-${VERSION}"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: working tree not clean." >&2
  exit 1
fi

git checkout -b "$BRANCH" origin/staging
node scripts/sync-plugin-version.mjs --sha

if [[ -z "$(git status --porcelain marketplace.json)" ]]; then
  echo "marketplace.json sha already current — nothing to do."
  git checkout - && git branch -d "$BRANCH"
  exit 0
fi

git add marketplace.json
git commit -m "fix(release): point marketplace sha at the ${VERSION} release commit

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push -u origin "$BRANCH"

PR_URL=$(gh pr create --base staging \
  --title "fix(release): point marketplace sha at the ${VERSION} release commit" \
  --body "Post-promotion sha sync (scripts/release-sha-followup.sh). Updates marketplace.json plugins[0].source.sha to the ${VERSION} release merge on main.")

echo "Opened ${PR_URL} — the auto-merge workflow will squash-merge it once checks pass."
echo "After it lands on staging, run tw-pr to promote the sha fix to main."
