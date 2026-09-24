#!/usr/bin/env bash
# Discards tracked modifications left in the worktree after the owned outputs
# have been committed, so a following `git rebase` cannot be blocked by them.
# Untracked files are left alone.
set -euo pipefail

dirty="$(git status --porcelain --untracked-files=no)"
if [ -n "$dirty" ]; then
  echo "Discarding tracked changes outside the committed fantasy outputs:"
  echo "$dirty"
  git reset --hard HEAD
fi
