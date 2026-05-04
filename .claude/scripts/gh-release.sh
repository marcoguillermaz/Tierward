#!/usr/bin/env bash
set -euo pipefail

export GH_TOKEN=$(gh auth token --user marcoguillermaz)

TAG="${1:?Usage: gh-release.sh <tag> <title> <notes-file>}"
TITLE="${2:?Usage: gh-release.sh <tag> <title> <notes-file>}"
NOTES_FILE="${3:?Usage: gh-release.sh <tag> <title> <notes-file>}"

[[ -f "$NOTES_FILE" ]] || { echo "Error: notes file not found: $NOTES_FILE" >&2; exit 1; }

gh release create "$TAG" --title "$TITLE" --notes-file "$NOTES_FILE"
