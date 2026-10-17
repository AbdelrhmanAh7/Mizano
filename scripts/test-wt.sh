#!/usr/bin/env bash
# Offline integration tests: real disposable Git repositories, stubbed pnpm.
set -euo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
cd "$root"
mkdir -p tmp
fixture="$root/$(mktemp -d tmp/wt-tests.XXXXXX)"
trap '[[ $fixture == "$root/tmp/wt-tests."* ]] && rm -rf -- "$fixture"' EXIT
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.excludesfile GIT_CONFIG_VALUE_0=/dev/null
export PNPM_LOG="$fixture/pnpm.log"
(cd "$fixture" && mkdir -p 'repo with spaces/scripts' bin)
cp "$root/scripts/wt-new.sh" "$root/scripts/wt-clean.sh" "$fixture/repo with spaces/scripts/"
cat >"$fixture/bin/pnpm" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf '%s|%s\n' "$PWD" "$*" >>"$PNPM_LOG"
[[ ${FAIL_INSTALL:-0} != 1 || $1 != install ]]
[[ ${FAIL_GENERATE:-0} != 1 || $1 != db:generate ]]
[[ ${FAIL_BUILD:-0} != 1 || $1 != -r ]]
STUB
chmod +x "$fixture/bin/pnpm"
export PATH="$fixture/bin:$PATH"
[[ $(command -v pnpm) == "$fixture/bin/pnpm" ]] || {
  printf 'Refusing tests without the pnpm stub.\n' >&2
  exit 1
}
cd "$fixture/repo with spaces"
git init -q -b master
git config user.name 'Offline test'
git config user.email 'offline@example.invalid'
printf '.worktrees/\n' >.gitignore
git add .
git commit -qm baseline
git update-ref refs/remotes/origin/master HEAD
git update-ref refs/remotes/origin/develop HEAD
passed=0
check() {
  "$@" || { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
  passed=$((passed + 1))
}
reject() {
  if "$@" >"$fixture/rejected.log" 2>&1; then
    printf 'Expected failure: %s\n' "$*" >&2
    exit 1
  fi
  passed=$((passed + 1))
}
has_branch() { git show-ref --verify --quiet "refs/heads/$1"; }
no_branch() { ! has_branch "$1"; }

reject bash scripts/wt-new.sh
reject bash scripts/wt-new.sh ../escape
reject bash scripts/wt-new.sh -option
reject bash scripts/wt-new.sh lane missing
reject bash scripts/wt-new.sh lane master extra
check test ! -e .worktrees
bash scripts/wt-new.sh clean
check test "$(git -C .worktrees/clean branch --show-current)" = clean
check test "$(git -C .worktrees/clean rev-parse HEAD)" = "$(git rev-parse origin/master)"
check test "$(wc -l <"$PNPM_LOG")" -eq 3
check grep -Fq '.worktrees/clean|install --offline --frozen-lockfile' "$PNPM_LOG"
check grep -Fq '.worktrees/clean|db:generate' "$PNPM_LOG"
check grep -Fq '.worktrees/clean|-r --filter ./packages/* --workspace-concurrency=1 run build' "$PNPM_LOG"
reject bash scripts/wt-new.sh clean
# Alternate base differs from master so ancestry is meaningful.
git commit -qm develop --allow-empty
git update-ref refs/remotes/origin/develop HEAD
bash scripts/wt-new.sh alternate develop
check test "$(git -C .worktrees/alternate rev-parse HEAD)" = "$(git rev-parse origin/develop)"
reject env FAIL_INSTALL=1 bash scripts/wt-new.sh failed
check test -d .worktrees/failed
check has_branch failed
check test "$(wc -l <"$PNPM_LOG")" -eq 7
reject env FAIL_GENERATE=1 bash scripts/wt-new.sh failed-generate
check test -d .worktrees/failed-generate
check test "$(wc -l <"$PNPM_LOG")" -eq 9
reject env FAIL_BUILD=1 bash scripts/wt-new.sh failed-build
check test -d .worktrees/failed-build
check test "$(wc -l <"$PNPM_LOG")" -eq 12

git worktree add -qb dirty .worktrees/dirty origin/master
printf 'changed\n' >>.worktrees/dirty/.gitignore
git worktree add -qb staged .worktrees/staged origin/master
printf 'staged\n' >.worktrees/staged/file
git -C .worktrees/staged add file
git worktree add -qb untracked .worktrees/untracked origin/master
printf 'untracked\n' >.worktrees/untracked/file
git worktree add -qb locked .worktrees/locked origin/master
git worktree lock .worktrees/locked
git worktree add -qb outside "$fixture/outside" origin/master
git worktree add -q --detach .worktrees/detached origin/master
mkdir .worktrees/unregistered
# Existing branch/path collisions must preserve the original.
reject bash scripts/wt-new.sh unregistered
check test -d .worktrees/unregistered
# Missing master fails closed, with no removals.
git update-ref -d refs/remotes/origin/master
reject bash scripts/wt-clean.sh
check test -d .worktrees/clean
git update-ref refs/remotes/origin/master master~1
# Run from a worker subdirectory: scripts anchor their owning checkout.
(cd .worktrees/dirty && bash ../../scripts/wt-clean.sh) >"$fixture/clean.log"
check test ! -d .worktrees/clean
check no_branch clean
check test ! -d .worktrees/failed
check no_branch failed
check no_branch failed-generate
check no_branch failed-build
for lane in alternate dirty staged untracked locked; do
  check test -d ".worktrees/$lane"
  check has_branch "$lane"
done
check test -d "$fixture/outside"
check has_branch outside
check test -d .worktrees/detached
check test -d .worktrees/unregistered
check grep -Fq 'Removed worktree:' "$fixture/clean.log"
check grep -Fq 'Removed branch: clean' "$fixture/clean.log"
check grep -Fq 'Skipped dirty worktree:' "$fixture/clean.log"
check bash scripts/wt-clean.sh
reject bash scripts/wt-clean.sh extra
# Symlink containment checks are supported on Unix; Git Bash may lack permission.
if ln -s "$fixture/outside" .worktrees/link 2>/dev/null && [[ -L .worktrees/link ]]; then
  check bash scripts/wt-clean.sh
  check test -d "$fixture/outside"
  # A symlinked container must fail closed for both entrypoints.
  mv .worktrees saved-worktrees
  ln -s saved-worktrees .worktrees
  reject bash scripts/wt-clean.sh
  reject bash scripts/wt-new.sh symlink-container
  rm .worktrees
  mv saved-worktrees .worktrees
else
  printf 'Symlink checks unavailable on this host.\n'
fi
printf 'Passed %s worktree helper checks.\n' "$passed"
