#!/usr/bin/env bash
# Create an isolated worktree for one agent lane.
# Usage: scripts/agents/new-lane.sh <feature-branch> <lane-name>
#   e.g. scripts/agents/new-lane.sh 002-intake-ai obidit-normaliser
# Result: ../fera-lanes/<lane-name> on branch <feature-branch>--<lane-name>
set -euo pipefail
feature="${1:?feature branch, e.g. 002-intake-ai}"
lane="${2:?lane name, e.g. obidit-normaliser}"
root="$(git rev-parse --show-toplevel)"
dest="$(dirname "$root")/fera-lanes/$lane"
branch="${feature}--${lane}"

git -C "$root" fetch origin -q 2>/dev/null || true
if git -C "$root" show-ref --verify --quiet "refs/heads/$feature"; then base="$feature"
elif git -C "$root" show-ref --verify --quiet "refs/remotes/origin/$feature"; then base="origin/$feature"
else base="origin/main"; git -C "$root" show-ref --verify --quiet refs/remotes/origin/main || base="main"; fi

mkdir -p "$(dirname "$dest")"
git -C "$root" worktree add -b "$branch" "$dest" "$base"
# carry local env (never committed) so the lane can run the app
for f in .env.local; do [ -f "$root/$f" ] && cp "$root/$f" "$dest/$f"; done
# spec-kit pointer: start the lane on its feature
if [ -d "$dest/specs/$feature" ]; then
  mkdir -p "$dest/.specify"
  printf '{\n  "feature_directory": "specs/%s"\n}\n' "$feature" > "$dest/.specify/feature.json"
fi
echo "Lane ready: $dest  (branch $branch from $base)"
echo "Next: cd $dest && npm ci && claude   # or: codex"
echo "When merged: git worktree remove $dest && git branch -d $branch"
