#!/usr/bin/env bash
set -euo pipefail

REMOTE="${REMOTE:-origin}"
DEV_BRANCH="${DEV_BRANCH:-dev}"
MAIN_BRANCH="${MAIN_BRANCH:-main}"

TAG_PREFIX="${TAG_PREFIX:-1.0.}"
PUSH="${PUSH:-1}"

die() {
  echo "error: $*" >&2
  exit 1
}

ensure_clean_worktree() {
  if ! git diff --quiet || ! git diff --cached --quiet; then
    die "working tree is not clean (commit/stash first)"
  fi
}

current_branch() {
  git rev-parse --abbrev-ref HEAD
}

max_patch_for_prefix() {
  local prefix="$1"
  # tags like 1.0.15
  git tag -l "${prefix}*" | \
    sed -E "s/^${prefix}([0-9]+)$/\\1/" | \
    awk '/^[0-9]+$/{print $0}' | \
    sort -n | tail -1
}

next_tag() {
  local prefix="$1"
  local max_patch
  max_patch="$(max_patch_for_prefix "$prefix" || true)"
  if [[ -z "${max_patch}" ]]; then
    echo "${prefix}0"
    return
  fi
  echo "${prefix}$((max_patch + 1))"
}

echo "== collecter release script =="
echo "remote: ${REMOTE}"
echo "merge: ${DEV_BRANCH} -> ${MAIN_BRANCH}"
echo "tag prefix: ${TAG_PREFIX}"

ensure_clean_worktree

git fetch "${REMOTE}" --tags

# Make sure local branches are up-to-date
git checkout "${DEV_BRANCH}" >/dev/null 2>&1 || die "branch '${DEV_BRANCH}' not found"
git pull --ff-only "${REMOTE}" "${DEV_BRANCH}"

git checkout "${MAIN_BRANCH}" >/dev/null 2>&1 || die "branch '${MAIN_BRANCH}' not found"
git pull --ff-only "${REMOTE}" "${MAIN_BRANCH}"

ensure_clean_worktree

# Check if dev has anything to merge
if [[ -z "$(git log --oneline "${MAIN_BRANCH}..${DEV_BRANCH}")" ]]; then
  echo "nothing to merge: ${DEV_BRANCH} is not ahead of ${MAIN_BRANCH}"
  exit 0
fi

TAG="$(next_tag "${TAG_PREFIX}")"
echo "next tag: ${TAG}"

# Commits being released (for the merge commit body)
RELEASE_LOG="$(git log --oneline "${MAIN_BRANCH}..${DEV_BRANCH}" | sed 's/^/- /' || true)"

# Real merge (--no-ff) dev into main: main keeps a release merge commit AND
# every individual dev commit + branch topology stays visible in history.
git merge --no-ff "${DEV_BRANCH}" -m "$(cat <<EOF
Release ${TAG}

${RELEASE_LOG}
EOF
)"

# Tag message with commits since previous tag (best-effort)
PREV_TAG="$(git tag -l "${TAG_PREFIX}*" --sort=-v:refname | head -1 || true)"
if [[ -n "${PREV_TAG}" ]]; then
  CHANGES="$(git log --oneline "${PREV_TAG}..HEAD" | sed 's/^/- /' || true)"
else
  CHANGES="$(git log --oneline -20 | sed 's/^/- /' || true)"
fi

git tag -a "${TAG}" -m "$(cat <<EOF
Release ${TAG}

${CHANGES}
EOF
)"

if [[ "${PUSH}" == "1" ]]; then
  echo "pushing ${MAIN_BRANCH} and tag ${TAG}..."
  git push "${REMOTE}" "${MAIN_BRANCH}"
  git push "${REMOTE}" "${TAG}"
else
  echo "PUSH=0 set; skipping push."
fi

# Fast-forward dev up to the release merge commit. Because this was a real
# (--no-ff) merge, the release commit is a descendant of the dev tip, so dev
# advances with a plain fast-forward — no reset, no force push. dev and main
# end up identical while all commits stay in history, and the next release
# sees only genuinely new commits via `main..dev`.
echo "syncing ${MAIN_BRANCH} -> ${DEV_BRANCH} (fast-forward)..."
git checkout "${DEV_BRANCH}" >/dev/null 2>&1 || die "branch '${DEV_BRANCH}' not found"
git merge --ff-only "${MAIN_BRANCH}"

if [[ "${PUSH}" == "1" ]]; then
  echo "pushing ${DEV_BRANCH}..."
  git push "${REMOTE}" "${DEV_BRANCH}"
else
  echo "PUSH=0 set; skipping ${DEV_BRANCH} push."
fi

echo "done: ${TAG}"
