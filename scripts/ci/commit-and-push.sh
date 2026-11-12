#!/usr/bin/env bash
# Commit what is staged and push it to a branch, safely.
#
#   scripts/ci/commit-and-push.sh "<commit message>" [branch=main]
#
# Used by the scheduled data workflows. It exists because a single oversized
# file used to take an entire data commit down with it: GitHub's pre-receive
# hook rejects any blob over 100 MB, every retry failed identically, and the
# fresh schedule/results that were bundled in the same commit never reached
# main (issue 454). This helper therefore:
#
#   1. refuses to commit when any staged file exceeds MAX_FILE_BYTES, names the
#      offender with an ::error:: annotation, unstages everything (so no later
#      step can sweep the file in) and exits 3 -- BEFORE a doomed commit exists;
#   2. retries only failures that can succeed on retry (non-fast-forward races
#      against other data writers) -- a GH001 large-file rejection is
#      non-retryable and fails immediately with a clear diagnosis.
#
# Env: MAX_FILE_BYTES (default 95 MiB), PUSH_ATTEMPTS (default 5),
#      PUSH_SLEEP_BASE seconds (default 10; attempt N sleeps N*base).
# Exit: 0 pushed or nothing to do | 1 push failed | 3 oversized staged file.
set -euo pipefail

message="${1:?usage: commit-and-push.sh <commit message> [branch]}"
branch="${2:-main}"
max_bytes="${MAX_FILE_BYTES:-99614720}"
attempts="${PUSH_ATTEMPTS:-5}"
sleep_base="${PUSH_SLEEP_BASE:-10}"

if git diff --cached --quiet; then
  echo "No staged changes; nothing to commit."
  exit 0
fi

oversized=()
while IFS= read -r -d '' path; do
  size="$(git cat-file -s ":${path}" 2>/dev/null || echo 0)"
  if [ "${size}" -gt "${max_bytes}" ]; then
    oversized+=("${path} ($((size / 1048576)) MB)")
  fi
done < <(git diff --cached --name-only -z --diff-filter=AMR)

if [ "${#oversized[@]}" -gt 0 ]; then
  for entry in "${oversized[@]}"; do
    echo "::error title=Refusing to commit oversized file::${entry} exceeds the $((max_bytes / 1048576)) MB limit (GitHub rejects files over 100 MB). Shard or prune this dataset."
  done
  echo "Unstaging everything so no later step commits the oversized file; the files themselves are untouched." >&2
  git reset -q
  exit 3
fi

git commit -q -m "${message}"

last_output=""
for attempt in $(seq 1 "${attempts}"); do
  echo "Push attempt ${attempt}/${attempts}"
  git fetch -q origin "${branch}"
  if ! git rebase -q "origin/${branch}"; then
    echo "Rebase failed on attempt ${attempt}; aborting before retry." >&2
    git rebase --abort || true
  elif last_output="$(git push origin "HEAD:${branch}" 2>&1)"; then
    echo "${last_output}"
    echo "Pushed to ${branch}."
    exit 0
  else
    echo "${last_output}" >&2
    if grep -Eq "GH001|exceeds GitHub's file size limit|Large files detected" <<<"${last_output}"; then
      echo "::error title=Push rejected by GitHub (file size)::A file in this commit exceeds GitHub's 100 MB limit. This will not retry: every retry would fail identically." >&2
      exit 1
    fi
  fi
  if [ "${attempt}" -lt "${attempts}" ]; then
    sleep $((attempt * sleep_base))
  fi
done

echo "::error title=Push failed::All ${attempts} push attempts failed; the refreshed data was not published." >&2
exit 1
