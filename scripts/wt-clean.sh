#!/usr/bin/env bash
set -euo pipefail

if (( $# != 0 )); then
  printf 'Usage: wt-clean\n' >&2
  exit 1
fi
root=$(git -C "$(dirname "${BASH_SOURCE[0]}")/.." rev-parse --show-toplevel)
cd "$root"
master=$(git rev-parse --verify 'refs/remotes/origin/master^{commit}')
if [[ -L .worktrees ]]; then
  printf 'Refusing a symlinked .worktrees directory.\n' >&2
  exit 1
fi
[[ -d .worktrees ]] || exit 0
managed=$(cd .worktrees && pwd -P)
current=$(pwd -P)

clean_record() {
  local resolved tip status branch
  [[ -n $path && $ref == refs/heads/* && $locked == false ]] || return 0
  [[ -d $path && ! -L $path ]] || return 0
  resolved=$(cd "$path" && pwd -P)
  [[ $resolved == "$managed/"* && $resolved != "$current" ]] || return 0
  tip=$(git rev-parse --verify "$ref^{commit}")
  git merge-base --is-ancestor "$tip" "$master" || return 0
  status=$(git -C "$path" status --porcelain --untracked-files=all)
  if [[ -n $status ]]; then
    printf 'Skipped dirty worktree: %s\n' "$path"
    return 0
  fi
  # Git's non-forced removal rechecks cleanliness and protects locked worktrees.
  git worktree remove -- "$path"
  printf 'Removed worktree: %s\n' "$path"
  if [[ $(git rev-parse --verify "$ref^{commit}") != "$tip" ]]; then
    printf 'Retained branch changed during cleanup: %s\n' "$ref"
    return 0
  fi
  branch=${ref#refs/heads/}
  # Ancestry against origin/master was checked above. -d can instead test a
  # stale upstream; -D is safe here only for the unchanged, verified merged tip.
  git branch -D -- "$branch"
  printf 'Removed branch: %s\n' "$branch"
}

# NUL framing preserves spaces/newlines in worktree paths; no parsing of quotes.
records=$(mktemp)
trap 'rm -f -- "$records"' EXIT
git worktree list --porcelain -z >"$records"
path='' ref='' locked=false
while IFS= read -r -d '' field; do
  case "$field" in
    'worktree '*) path=${field#worktree } ;;
    'branch '*) ref=${field#branch } ;;
    locked*) locked=true ;;
    '') clean_record; path='' ref='' locked=false ;;
  esac
done <"$records"
