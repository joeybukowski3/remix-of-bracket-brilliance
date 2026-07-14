#!/usr/bin/env bash

set -euo pipefail

receipt="public/data/mlb/numerology/email-send-state.json"
workflow_source="MLB Numerology Email Reliable Delivery"
max_attempts=5
tmp_receipt="$(mktemp)"
trap 'rm -f "$tmp_receipt"' EXIT

test -n "${SLATE_DATE:-}" || { echo "::error::SLATE_DATE is required to persist the delivery receipt."; exit 1; }
test -f "$receipt" || { echo "::error::Missing delivery receipt at ${receipt}."; exit 1; }

echo "Working tree before receipt persistence:"
git status --short
cp "$receipt" "$tmp_receipt"

expected_subject="MLB Numerology Plays — ${SLATE_DATE}"
expected_email_key="mlb-numerology:${SLATE_DATE}:${expected_subject}"

validate_receipt() {
  local candidate="$1"
  jq -e \
    --arg date "$SLATE_DATE" \
    --arg subject "$expected_subject" \
    --arg email_key "$expected_email_key" \
    --arg source "$workflow_source" \
    'type == "object"
      and .date == $date
      and (.result == "sent" or .result == "already_exists")
      and .subject == $subject
      and .emailKey == $email_key
      and (.timestamp | type == "string" and length > 0)
      and .sourceWorkflow == $source' \
    "$candidate" >/dev/null
}

if ! validate_receipt "$tmp_receipt"; then
  echo "::error::Delivery receipt is malformed or does not match slate date ${SLATE_DATE}."
  exit 1
fi

intended_result="$(jq -r '.result' "$tmp_receipt")"
archive_path="public/data/mlb/numerology/archive/${SLATE_DATE}.json"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

for attempt in $(seq 1 "$max_attempts"); do
  echo "Receipt persistence attempt ${attempt}/${max_attempts}."

  # The email generator rewrites tracked card/performance files and creates
  # slate archives plus ignored previews. Remove those changes before sync.
  git reset --hard HEAD
  git clean -fd -- "$archive_path"
  git clean -fdx -- \
    public/data/mlb/numerology/email-preview.html \
    public/data/mlb/numerology/email-preview.txt

  if [ -n "$(git status --porcelain --untracked-files=all)" ]; then
    echo "::error::Working tree is still dirty after generated-file cleanup."
    git status --short
    exit 1
  fi

  git fetch origin main
  git reset --hard FETCH_HEAD

  if [ -f "$receipt" ] && validate_receipt "$receipt"; then
    origin_result="$(jq -r '.result' "$receipt")"
    if [ "$origin_result" = "$intended_result" ]; then
      echo "A valid ${SLATE_DATE} ${origin_result} receipt is already present on main; nothing to commit."
      exit 0
    fi
  fi

  mkdir -p "$(dirname "$receipt")"
  cp "$tmp_receipt" "$receipt"
  validate_receipt "$receipt"
  git add -- "$receipt"

  staged_paths="$(git diff --cached --name-only)"
  if [ "$staged_paths" != "$receipt" ]; then
    echo "::error::Unexpected staged paths while persisting the delivery receipt."
    git diff --cached --name-only
    exit 1
  fi

  if git diff --cached --quiet; then
    echo "Receipt already present on main; nothing to commit."
    exit 0
  fi

  git commit -m "chore: record numerology email delivery ${SLATE_DATE}"

  if push_output="$(git push origin HEAD:main 2>&1)"; then
    printf '%s\n' "$push_output"
    exit 0
  fi
  printf '%s\n' "$push_output"

  if ! grep -Eq '\(fetch first\)|non-fast-forward' <<<"$push_output"; then
    echo "::error::Receipt push failed for a reason other than a concurrent main update; not retrying."
    exit 1
  fi

  if [ "$attempt" -lt "$max_attempts" ]; then
    sleep $((attempt * 10))
  fi
done

echo "::error::Email sent, but its receipt could not be pushed after ${max_attempts} concurrent-update attempts."
exit 1
