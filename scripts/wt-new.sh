#!/usr/bin/env bash
set -euo pipefail

if (( $# < 1 || $# > 2 )); then
  printf 'Usage: wt-new <lane> [base]\n' >&2
  exit 1
fi
lane=$1
base=${2:-master}
if [[ ! $lane =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]*$ ]]; then
  printf 'Lane must contain only letters, digits, underscores or hyphens.\n' >&2
  exit 1
fi
root=$(git -C "$(dirname "${BASH_SOURCE[0]}")/.." rev-parse --show-toplevel)
cd "$root"
git check-ref-format "refs/remotes/origin/$base"
git rev-parse --verify "refs/remotes/origin/$base^{commit}" >/dev/null
if [[ -L .worktrees ]]; then
  printf 'Refusing a symlinked .worktrees directory.\n' >&2
  exit 1
fi
if [[ -e .worktrees/$lane || -L .worktrees/$lane ]]; then
  printf 'Worktree path already exists: .worktrees/%s\n' "$lane" >&2
  exit 1
fi
mkdir -p .worktrees
git worktree add -b "$lane" -- ".worktrees/$lane" "refs/remotes/origin/$base"
cd ".worktrees/$lane"
# Leave a failed setup intact for inspection/retry; never discard worker files.
pnpm install --offline --frozen-lockfile
pnpm db:generate
pnpm -r --filter './packages/*' --workspace-concurrency=1 run build
printf 'Created worktree %s on branch %s.\n' "$PWD" "$lane"
