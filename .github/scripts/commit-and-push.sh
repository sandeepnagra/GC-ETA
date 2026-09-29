#!/usr/bin/env bash
#
# Commit some paths and push, surviving a concurrent push to the same branch.
#
# Every workflow here pushes to main, and each has its own concurrency group,
# so nothing stops two of them running at once -- which is exactly what
# happened when all three were triggered by hand within thirty seconds: the
# daily refresh pushed first, and Watch feeds died on "! [rejected] main ->
# main (fetch first)" with a state file it had already correctly computed.
#
# A bare push is the wrong shape for that. These jobs touch disjoint files
# (feed-state.json vs the data bundle), so a rejected push is never a real
# conflict, just a stale base -- rebase and try again.
#
# Usage: commit-and-push.sh "<commit message>" <path> [path...]
set -euo pipefail

MESSAGE="$1"
shift
PATHS=("$@")

ATTEMPTS="${PUSH_ATTEMPTS:-5}"
BRANCH="${GITHUB_REF_NAME:-main}"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git add -- "${PATHS[@]}"

# Reported as a step output so a caller can branch on it. refresh-data.yml
# declares it as a job output; nothing consumes it today, but it is part of
# that workflow's shape and is cheaper to keep than to re-derive later.
note_changed() {
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "changed=$1" >> "$GITHUB_OUTPUT"
  fi
}

if git diff --cached --quiet; then
  echo "nothing to commit"
  note_changed false
  exit 0
fi

git commit -m "$MESSAGE"
note_changed true

for attempt in $(seq 1 "$ATTEMPTS"); do
  if git push origin "HEAD:$BRANCH"; then
    echo "pushed on attempt $attempt"
    exit 0
  fi

  echo "push rejected (attempt $attempt/$ATTEMPTS), rebasing onto origin/$BRANCH"
  git fetch origin "$BRANCH"
  # --autostash covers anything a later build step left in the tree; without
  # it the rebase aborts instead of retrying, which is the failure this
  # script exists to prevent.
  if ! git rebase --autostash "origin/$BRANCH"; then
    git rebase --abort || true
    echo "could not rebase onto origin/$BRANCH -- a real conflict, not a race" >&2
    exit 1
  fi
  # Back off a little so two racing jobs do not retry in lockstep forever.
  sleep $(( attempt * 3 ))
done

echo "still could not push after $ATTEMPTS attempts" >&2
exit 1
