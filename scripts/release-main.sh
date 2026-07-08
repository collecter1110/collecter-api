#!/usr/bin/env bash
set -euo pipefail

REMOTE="${REMOTE:-origin}"
DEV_BRANCH="${DEV_BRANCH:-dev}"
MAIN_BRANCH="${MAIN_BRANCH:-main}"

TAG_PREFIX="${TAG_PREFIX:-1.0.}"
# Marker tags placed on the dev tip at each release. A squashed main is not an
# ancestor of dev, so `main..dev` can't tell what's new — we diff from the last
# marker instead. Kept namespaced so they're easy to distinguish from releases.
RELEASED_PREFIX="${RELEASED_PREFIX:-released/}"
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

echo "== collecter release script (squash) =="
echo "remote: ${REMOTE}"
echo "release: ${DEV_BRANCH} -> ${MAIN_BRANCH} (squash, one commit per release)"
echo "tag prefix: ${TAG_PREFIX}"

ensure_clean_worktree

git fetch "${REMOTE}" --tags

# Make sure local branches are up-to-date (fails safely if diverged).
git checkout "${DEV_BRANCH}" >/dev/null 2>&1 || die "branch '${DEV_BRANCH}' not found"
git pull --ff-only "${REMOTE}" "${DEV_BRANCH}"

git checkout "${MAIN_BRANCH}" >/dev/null 2>&1 || die "branch '${MAIN_BRANCH}' not found"
git pull --ff-only "${REMOTE}" "${MAIN_BRANCH}"

ensure_clean_worktree

# Detection base: the dev commit released last time. On the very first run there
# is no marker yet, so fall back to comparing against main.
LAST_MARKER="$(git tag -l "${RELEASED_PREFIX}${TAG_PREFIX}*" --sort=-v:refname | head -1 || true)"
if [[ -n "${LAST_MARKER}" ]]; then
  BASE="${LAST_MARKER}"
else
  BASE="${MAIN_BRANCH}"
fi

if [[ -z "$(git log --oneline "${BASE}..${DEV_BRANCH}")" ]]; then
  echo "nothing to release: no new commits on ${DEV_BRANCH} since ${BASE}"
  exit 0
fi

TAG="$(next_tag "${TAG_PREFIX}")"
echo "next tag: ${TAG}"
echo "releasing commits since: ${BASE}"

# Real dev commits going into this release (for the release commit + tag body).
RELEASE_LOG="$(git log --oneline "${BASE}..${DEV_BRANCH}" | sed 's/^/- /' || true)"

# Remember exactly which dev commit we are releasing (for the marker tag).
DEV_SHA="$(git rev-parse "${DEV_BRANCH}")"

# Squash release: make main's tree EXACTLY match dev's tip in a single commit.
# `read-tree --reset -u` snapshots dev's tree onto main's clean index+worktree
# while HEAD stays on main, so the new commit's parent is main (dev commits do
# NOT enter main's history) and its tree mirrors dev's current state. Being a
# true snapshot, it also reflects reverts on dev correctly (unlike a 3-way
# squash-merge from an ancient common ancestor).
git checkout "${MAIN_BRANCH}" >/dev/null 2>&1
git read-tree --reset -u "${DEV_BRANCH}"
git commit --allow-empty -m "$(cat <<EOF
Release ${TAG}

${RELEASE_LOG}
EOF
)"

# Release tag on main's squash commit — this is what shows up on main / GitHub.
git tag -a "${TAG}" -m "$(cat <<EOF
Release ${TAG}

${RELEASE_LOG}
EOF
)"

# Marker tag on the dev tip so the NEXT release diffs from here.
git tag -a "${RELEASED_PREFIX}${TAG}" "${DEV_SHA}" -m "released ${TAG} from ${DEV_BRANCH}"

if [[ "${PUSH}" == "1" ]]; then
  echo "pushing ${MAIN_BRANCH}, tag ${TAG}, marker ${RELEASED_PREFIX}${TAG}..."
  git push "${REMOTE}" "${MAIN_BRANCH}"
  git push "${REMOTE}" "${TAG}"
  git push "${REMOTE}" "${RELEASED_PREFIX}${TAG}"
else
  echo "PUSH=0 set; skipping push."
fi

# dev is intentionally left untouched: it keeps its full commit history and is
# never fast-forwarded to main (a squashed main and dev deliberately diverge).
echo "done: ${TAG}"
echo "  ${MAIN_BRANCH}: single release commit (${TAG})"
echo "  ${DEV_BRANCH}: full history preserved, untouched"
