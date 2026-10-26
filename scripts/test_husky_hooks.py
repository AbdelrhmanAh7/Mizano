"""Run the real .husky/pre-push (and its watchdog) against a throwaway git repo.

Run: python3 -m unittest discover -s scripts -p 'test_husky_hooks.py'
turbo, tsc, jest and prisma are recording stubs, so no packages are installed, built or tested
and nothing leaves the temp directory.
"""

import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tests.support.process_state import (
    ProcessState,
    assert_child_terminated,
    classify_process_state,
)

PRE_PUSH = ROOT / ".husky" / "pre-push"
PRE_COMMIT = ROOT / ".husky" / "pre-commit"
ZERO = "0" * 40

# Adapted from pre-commit's no_git_env (pre_commit/git.py, MIT License)
# Tightened allowlist: only non-locating Git execution binary path is permitted from inherited env.
# Strips all repo-locating variables (GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, GIT_OBJECT_DIRECTORY,
# GIT_COMMON_DIR, GIT_PREFIX) and config injections (GIT_CONFIG_PARAMETERS, GIT_CONFIG_COUNT, etc.)
_GIT_ENV_ALLOWLIST = frozenset({
    "GIT_EXEC_PATH",
})


def sanitized_git_env(base=None, overrides=None):
    """Return an isolated copy of environment mapping isolating subprocesses from inherited Git repo state.

    Drops inherited GIT_* variables except the fixed allowlist {GIT_EXEC_PATH}, ensuring that
    all variables from `git rev-parse --local-env-vars` (e.g. GIT_DIR, GIT_WORK_TREE,
    GIT_INDEX_FILE, GIT_OBJECT_DIRECTORY, GIT_COMMON_DIR, GIT_PREFIX) and config injection
    variables (GIT_CONFIG_PARAMETERS, GIT_CONFIG_COUNT, GIT_CONFIG_KEY_*, GIT_CONFIG_VALUE_*)
    are stripped.
    Applies explicit overrides last so test-specific values take precedence.
    Setting an override key to None removes it from the resulting environment.
    Never mutates base or os.environ.
    """
    source = os.environ if base is None else base
    clean = {
        k: v for k, v in source.items()
        if not k.startswith("GIT_") or k in _GIT_ENV_ALLOWLIST
    }
    if overrides:
        for k, v in overrides.items():
            if v is None:
                clean.pop(k, None)
            else:
                clean[k] = str(v)
    return clean


_git_env = sanitized_git_env


def __getattr__(name):
    """Dynamically provide isolated environments for backward-compatibility attributes.

    Prevents static module-level environment snapshots from going stale across tests.
    """
    if name == "GIT_ENV_CLEAN":
        return sanitized_git_env()
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def git(cwd, *args, env=None):
    """Execute git command in cwd isolated from inherited repository environment variables."""
    return subprocess.run(
        ["git", *args], cwd=cwd, check=True, capture_output=True, text=True, env=sanitized_git_env(overrides=env)
    ).stdout.strip()


def pid_alive(pid):
    """Check whether a pid is still alive, recognizing terminated and zombie states."""
    result = classify_process_state(pid)
    if result.state == ProcessState.TERMINATED:
        return False
    if sys.platform.startswith("linux") and result.state == ProcessState.ZOMBIE:
        return False
    return True


class PrePushHookTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="mz-prepush-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.repo = self.tmp / "repo"
        self.repo.mkdir()
        git(self.repo, "init", "-q", "-b", "master")
        git(self.repo, "config", "user.email", "t@example.com")
        git(self.repo, "config", "user.name", "t")
        git(self.repo, "config", "commit.gpgsign", "false")
        (self.repo / ".husky").mkdir()
        shutil.copy(PRE_PUSH, self.repo / ".husky" / "pre-push")
        self.log = self.tmp / "calls.log"
        bin_dir = self.repo / "node_modules" / ".bin"
        bin_dir.mkdir(parents=True)
        for tool in ("tsc", "jest"):
            self.stub(tool, "exit 0")
        self.stub("turbo", f'echo "turbo $*" >> "{self.log}"')
        self.stub("prisma", f'echo "prisma $*" >> "{self.log}"')
        (self.repo / "node_modules" / ".prisma" / "client").mkdir(parents=True)
        (self.repo / "node_modules" / ".prisma" / "client" / "index.d.ts").write_text("")
        self.base = self.commit("apps/web/a.txt", "base")
        git(self.repo, "update-ref", "refs/remotes/origin/master", self.base)

    def stub(self, name, body):
        path = self.repo / "node_modules" / ".bin" / name
        path.write_text(f"#!/bin/sh\n{body}\n")
        path.chmod(0o755)

    def commit(self, rel, content):
        path = self.repo / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        git(self.repo, "add", "-A", ":!node_modules")
        git(self.repo, "commit", "-q", "-m", content)
        return git(self.repo, "rev-parse", "HEAD")

    def push(self, lines, **env):
        """Execute .husky/pre-push isolated from inherited Git repository environment variables.

        Strips SKIP_LOCAL_CI by default unless explicitly provided in env overrides.
        """
        clean = sanitized_git_env(overrides=env)
        if "SKIP_LOCAL_CI" not in env:
            clean.pop("SKIP_LOCAL_CI", None)
        stdin = "".join(f"{line}\n" for line in lines)
        result = subprocess.run(
            ["sh", str(self.repo / ".husky" / "pre-push"), "origin", "url"],
            cwd=self.repo, env=clean, input=stdin, capture_output=True, text=True, timeout=60,
        )
        calls = self.log.read_text().splitlines() if self.log.exists() else []
        return result, calls

    def line(self, local_sha, remote_sha=ZERO, ref="refs/heads/feat"):
        return f"{ref} {local_sha} {ref} {remote_sha}"

    def test_pushed_branch_is_filtered_against_remote_old_sha(self):
        old = self.commit("apps/web/b.txt", "old")
        new = self.commit("apps/web/c.txt", "new")
        result, calls = self.push([self.line(new, old)])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls, [f"turbo run type-check test --filter=...[{old}] --output-logs=errors-only"])

    def test_new_branch_uses_merge_base_with_origin_master(self):
        head = self.commit("apps/web/b.txt", "feature")
        result, calls = self.push([self.line(head)])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls, [f"turbo run type-check test --filter=...[{self.base}] --output-logs=errors-only"])

    def test_deleting_a_ref_checks_nothing(self):
        result, calls = self.push([self.line(ZERO, self.base)])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls, [])
        self.assertIn("nothing to check", result.stdout)

    def test_multi_ref_push_filters_every_pushed_ref(self):
        first = self.commit("apps/web/b.txt", "one")
        second = self.commit("apps/web/c.txt", "two")
        result, calls = self.push([
            self.line(second, self.base, "refs/heads/a"),
            self.line(second, first, "refs/heads/b"),
        ])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            calls,
            [f"turbo run type-check test --filter=...[{self.base}] --filter=...[{first}] --output-logs=errors-only"],
        )

    def test_pushed_sha_other_than_checked_out_head_checks_every_package(self):
        pushed = self.commit("apps/web/b.txt", "pushed")
        self.commit("apps/web/c.txt", "checked out, not pushed")
        result, calls = self.push([self.line(pushed, self.base)])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls, ["turbo run type-check test --output-logs=errors-only"])

    def test_root_config_change_checks_every_package(self):
        for config_file in (
            "package.json",
            "pnpm-lock.yaml",
            "pnpm-workspace.yaml",
            ".npmrc",
            "turbo.json",
            "tsconfig.json",
            "tsconfig.base.json",
            "tsconfig.build.json",
        ):
            head = self.commit(config_file, "{}")
            result, calls = self.push([self.line(head, self.base)])
            self.assertEqual(result.returncode, 0, f"Failed on {config_file}: {result.stderr}")
            self.assertEqual(
                calls,
                ["turbo run type-check test --output-logs=errors-only"],
                f"Failed to trigger all packages for {config_file}",
            )
            if self.log.exists():
                self.log.unlink()

    def test_schema_change_regenerates_the_prisma_client_first(self):
        head = self.commit("apps/api/prisma/schema.prisma", "model A {}")
        result, calls = self.push([self.line(head, self.base)])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls[0], "prisma generate --schema apps/api/prisma/schema.prisma")
        self.assertTrue(calls[1].startswith("turbo run type-check test"))

    def test_failing_check_blocks_the_push(self):
        self.stub("turbo", "exit 3")
        head = self.commit("apps/web/b.txt", "broken")
        result, _ = self.push([self.line(head, self.base)])
        self.assertEqual(result.returncode, 3)

    def test_skip_flag_and_missing_node_modules_do_not_run_checks(self):
        head = self.commit("apps/web/b.txt", "x")
        result, calls = self.push([self.line(head, self.base)], SKIP_LOCAL_CI="1")
        self.assertEqual((result.returncode, calls), (0, []))
        (self.repo / "node_modules" / ".bin" / "turbo").unlink()
        result, calls = self.push([self.line(head, self.base)])
        self.assertEqual((result.returncode, calls), (0, []))
        self.assertIn("node_modules missing", result.stdout)

    def test_watchdog_kills_the_whole_process_group_when_the_budget_is_exceeded(self):
        pids = self.tmp / "pids"
        self.stub("turbo", f'sleep 60 &\necho "$$ $!" > "{pids}"\nwait')
        head = self.commit("apps/web/b.txt", "slow")
        started = time.monotonic()
        result, _ = self.push([self.line(head, self.base)], MZ_PREPUSH_LIMIT_SECONDS="2")
        elapsed = time.monotonic() - started
        self.assertEqual(result.returncode, 124, result.stdout + result.stderr)
        self.assertGreaterEqual(elapsed, 1.8, f"Watchdog terminated too early ({elapsed:.2f}s)")
        self.assertLess(elapsed, 10.0, f"Watchdog exceeded wall-clock budget ({elapsed:.2f}s)")
        self.assertIn("exceeded the 2s limit", result.stderr)
        for pid in map(int, pids.read_text().split()):
            last_result = None
            for _ in range(30):
                last_result = classify_process_state(pid)
                if last_result.state == ProcessState.TERMINATED or (
                    sys.platform.startswith("linux") and last_result.state == ProcessState.ZOMBIE
                ):
                    break
                time.sleep(0.1)
            assert_child_terminated(last_result if last_result is not None else pid)

    def test_watchdog_survivor_assertion_fails_for_running_child(self):
        """A genuinely surviving child process must cause assert_child_terminated to fail."""
        sleeper = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"])

        def _cleanup():
            try:
                sleeper.kill()
                sleeper.wait(timeout=2)
            except Exception:
                pass

        self.addCleanup(_cleanup)
        with self.assertRaises(AssertionError) as ctx:
            assert_child_terminated(sleeper.pid)
        self.assertIn(str(sleeper.pid), str(ctx.exception))
        self.assertIn("RUNNING", str(ctx.exception))


class PreCommitHookTests(unittest.TestCase):
    """The real .husky/pre-commit with a recording _lint_staged.js: staged files only, 60 s watchdog."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="mz-precommit-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.repo = self.tmp / "repo"
        (self.repo / ".husky").mkdir(parents=True)
        git(self.repo, "init", "-q", "-b", "master")
        git(self.repo, "config", "user.email", "t@example.com")
        git(self.repo, "config", "user.name", "t")
        shutil.copy(PRE_COMMIT, self.repo / ".husky" / "pre-commit")
        (self.repo / "node_modules" / "eslint" / "bin").mkdir(parents=True)
        (self.repo / "node_modules" / "eslint" / "bin" / "eslint.js").write_text("")
        (self.repo / "node_modules" / "prettier").mkdir(parents=True)
        (self.repo / "node_modules" / "prettier" / "bin").mkdir()
        (self.repo / "node_modules" / "prettier" / "bin" / "prettier.cjs").write_text("")
        self.log = self.tmp / "staged.log"
        self.runner(f"require('fs').writeFileSync({str(self.log)!r}, require('child_process')"
                    ".execSync('git diff --cached --name-only').toString());")
        (self.repo / "staged.md").write_text("a")
        (self.repo / "unstaged.md").write_text("b")
        git(self.repo, "add", "staged.md")

    def runner(self, js):
        (self.repo / "_lint_staged.js").write_text(js)

    def run_hook(self, **env):
        """Execute .husky/pre-commit isolated from inherited Git repository environment variables."""
        clean = sanitized_git_env(overrides=env)
        return subprocess.run(["sh", str(self.repo / ".husky" / "pre-commit")], cwd=self.repo,
                              env=clean, capture_output=True, text=True, timeout=60)

    def test_lints_only_the_staged_files(self):
        result = self.run_hook()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.log.read_text().split(), ["staged.md"])

    def test_failing_lint_blocks_the_commit(self):
        self.runner("process.exit(1);")
        self.assertEqual(self.run_hook().returncode, 1)

    def test_missing_node_modules_skips_with_a_note(self):
        (self.repo / "node_modules" / "eslint" / "bin" / "eslint.js").unlink()
        result = self.run_hook()
        self.assertEqual(result.returncode, 0)
        self.assertIn("node_modules missing", result.stdout)
        self.assertFalse(self.log.exists())

    def test_watchdog_stops_a_hung_lint_run(self):
        self.runner("setTimeout(() => {}, 60000);")
        started = time.monotonic()
        result = self.run_hook(MZ_PRECOMMIT_LIMIT_SECONDS="2")
        elapsed = time.monotonic() - started
        self.assertEqual(result.returncode, 124, result.stdout + result.stderr)
        self.assertGreaterEqual(elapsed, 1.8, f"Watchdog terminated too early ({elapsed:.2f}s)")
        self.assertLess(elapsed, 10.0, f"Watchdog exceeded wall-clock budget ({elapsed:.2f}s)")
        self.assertIn("exceeded the 2s limit", result.stderr)

    def test_preserves_unstaged_hunks_in_partially_staged_files(self):
        real_lint_staged = ROOT / "_lint_staged.js"
        shutil.copy(real_lint_staged, self.repo / "_lint_staged.js")
        partial = self.repo / "partial.md"
        partial.write_text("initial content\n")
        git(self.repo, "add", "partial.md")
        git(self.repo, "commit", "-q", "-m", "init partial")
        partial.write_text("staged hunk\n")
        git(self.repo, "add", "partial.md")
        partial.write_text("staged hunk\nunstaged hunk\n")
        self.assertIn("partial.md", git(self.repo, "diff", "--name-only").split())
        self.assertIn("partial.md", git(self.repo, "diff", "--cached", "--name-only").split())

        (self.repo / "node_modules" / "prettier" / "bin" / "prettier.cjs").write_text("process.exit(0);")
        result = self.run_hook()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

        unstaged = git(self.repo, "diff", "--name-only").split()
        self.assertIn("partial.md", unstaged, "Partially staged file had its unstaged hunks staged")

    def test_run_hook_isolates_from_inherited_git_env_with_decoy(self):
        decoy = self.tmp / "decoy_precommit"
        decoy.mkdir()
        git(decoy, "init", "-q", "-b", "master")
        git(decoy, "config", "user.email", "d@example.com")
        git(decoy, "config", "user.name", "d")
        git(decoy, "config", "commit.gpgsign", "false")
        (decoy / "decoy.txt").write_text("decoy content")
        git(decoy, "add", "decoy.txt")
        git(decoy, "commit", "-q", "-m", "decoy commit")
        decoy_head = git(decoy, "rev-parse", "HEAD")
        decoy_index = (decoy / ".git" / "index").read_bytes()

        decoy_env = {
            "GIT_DIR": str(decoy / ".git"),
            "GIT_WORK_TREE": str(decoy),
            "GIT_INDEX_FILE": str(decoy / ".git" / "index"),
            "GIT_COMMON_DIR": str(decoy / ".git"),
            "MIZANO_TEST_SENTINEL": "precommit-sentinel",
        }
        with mock.patch.dict(os.environ, decoy_env):
            result = self.run_hook()
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(self.log.read_text().split(), ["staged.md"])
            self.assertEqual(git(decoy, "rev-parse", "HEAD"), decoy_head)
            self.assertEqual((decoy / ".git" / "index").read_bytes(), decoy_index)


class GitEnvironmentIsolationTests(unittest.TestCase):
    """Validate subprocess environment isolation against inherited Git-specific variables."""

    def test_sanitized_git_env_contract_and_immutability(self):
        """sanitized_git_env purges all GIT_* except allowlist, preserves sentinels, and never mutates base."""
        base_env = {
            "PATH": "/usr/bin:/bin",
            "HOME": "/tmp/home",
            "MIZANO_FIXTURE_SENTINEL": "keep-sentinel",
            "GIT_DIR": "/decoy/.git",
            "GIT_WORK_TREE": "/decoy",
            "GIT_INDEX_FILE": "/decoy/.git/index",
            "GIT_OBJECT_DIRECTORY": "/decoy/.git/objects",
            "GIT_COMMON_DIR": "/decoy/.git",
            "GIT_PREFIX": "sub/dir",
            "GIT_CONFIG_PARAMETERS": "'core.hooksPath=/decoy'",
            "GIT_CONFIG_COUNT": "1",
            "GIT_CONFIG_KEY_0": "core.hooksPath",
            "GIT_CONFIG_VALUE_0": "/decoy",
            "GIT_AUTHOR_NAME": "inherited-author",
            "GIT_EXEC_PATH": "/opt/git/libexec",
            "EMPTY_GIT_DIR": "",
            "TEMP_VAR": "will-be-deleted",
        }
        base_copy = dict(base_env)
        os_env_snapshot = dict(os.environ)

        overrides = {
            "GIT_AUTHOR_NAME": "explicit-fixture-author",
            "TEMP_VAR": None,
            "NEW_VAR": "added-value",
        }

        result = sanitized_git_env(base=base_env, overrides=overrides)

        # Base and os.environ must NOT be mutated
        self.assertEqual(base_env, base_copy, "sanitized_git_env must not mutate caller base dict")
        self.assertEqual(dict(os.environ), os_env_snapshot, "sanitized_git_env must not mutate os.environ")

        # Repository-locating and config-injection GIT_* variables must be removed
        for git_var in (
            "GIT_DIR",
            "GIT_WORK_TREE",
            "GIT_INDEX_FILE",
            "GIT_OBJECT_DIRECTORY",
            "GIT_COMMON_DIR",
            "GIT_PREFIX",
            "GIT_CONFIG_PARAMETERS",
            "GIT_CONFIG_COUNT",
            "GIT_CONFIG_KEY_0",
            "GIT_CONFIG_VALUE_0",
        ):
            self.assertNotIn(git_var, result, f"Variable {git_var} must be stripped")

        # Allowlist preserved
        self.assertEqual(result.get("GIT_EXEC_PATH"), "/opt/git/libexec")

        # Explicit overrides win over inherited / sanitized state
        self.assertEqual(result.get("GIT_AUTHOR_NAME"), "explicit-fixture-author")
        self.assertEqual(result.get("NEW_VAR"), "added-value")
        self.assertNotIn("TEMP_VAR", result)

        # Unrelated variables survive
        self.assertEqual(result.get("MIZANO_FIXTURE_SENTINEL"), "keep-sentinel")
        self.assertEqual(result.get("PATH"), "/usr/bin:/bin")
        self.assertEqual(result.get("HOME"), "/tmp/home")

    def test_git_env_helper_scrubs_local_vars_and_preserves_allowlist(self):
        local_vars_out = subprocess.run(
            ["git", "rev-parse", "--local-env-vars"],
            capture_output=True, text=True, check=True,
        ).stdout.splitlines()
        local_vars = [v.strip() for v in local_vars_out if v.strip()]

        simulated_env = {
            "PATH": os.environ.get("PATH", "/usr/bin"),
            "MIZANO_TEST_SENTINEL": "sentinel-42",
            "GIT_EXEC_PATH": "/opt/custom/git/exec",
            "GIT_AUTHOR_NAME": "inherited-author",
            "GIT_CONFIG_PARAMETERS": "'core.hooksPath=/decoy'",
            "GIT_CONFIG_COUNT": "1",
            "GIT_CONFIG_KEY_0": "core.hooksPath",
            "GIT_CONFIG_VALUE_0": "/decoy",
        }
        for var in local_vars:
            simulated_env[var] = f"/decoy/{var.lower()}"

        with mock.patch.dict(os.environ, simulated_env, clear=True):
            cleaned = sanitized_git_env(overrides={"GIT_AUTHOR_NAME": "explicit-fixture-author"})

        for var in local_vars:
            self.assertNotIn(var, cleaned, f"Repo-local variable {var} must be stripped")

        self.assertNotIn("GIT_CONFIG_PARAMETERS", cleaned)
        self.assertNotIn("GIT_CONFIG_COUNT", cleaned)
        self.assertNotIn("GIT_CONFIG_KEY_0", cleaned)
        self.assertNotIn("GIT_CONFIG_VALUE_0", cleaned)
        self.assertEqual(cleaned.get("MIZANO_TEST_SENTINEL"), "sentinel-42")
        self.assertEqual(cleaned.get("PATH"), simulated_env["PATH"])
        self.assertEqual(cleaned.get("GIT_EXEC_PATH"), "/opt/custom/git/exec")
        self.assertEqual(cleaned.get("GIT_AUTHOR_NAME"), "explicit-fixture-author")

    def test_git_and_push_helpers_do_not_touch_decoy_repo(self):
        tmp = Path(tempfile.mkdtemp(prefix="mz-decoy-"))
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)

        decoy = tmp / "decoy_repo"
        decoy.mkdir()
        git(decoy, "init", "-q", "-b", "master")
        git(decoy, "config", "user.email", "decoy@example.com")
        git(decoy, "config", "user.name", "decoy")
        git(decoy, "config", "commit.gpgsign", "false")
        (decoy / "decoy.txt").write_text("decoy content")
        git(decoy, "add", "decoy.txt")
        git(decoy, "commit", "-q", "-m", "decoy commit")

        decoy_head = git(decoy, "rev-parse", "HEAD")
        decoy_index = (decoy / ".git" / "index").read_bytes()
        decoy_refs = git(decoy, "show-ref")
        decoy_config_hash = hashlib.sha256((decoy / ".git" / "config").read_bytes()).hexdigest()

        # Simulate inherited Git environment pointing at the decoy repository
        decoy_env = {
            "GIT_DIR": str(decoy / ".git"),
            "GIT_WORK_TREE": str(decoy),
            "GIT_INDEX_FILE": str(decoy / ".git" / "index"),
            "GIT_OBJECT_DIRECTORY": str(decoy / ".git" / "objects"),
            "GIT_COMMON_DIR": str(decoy / ".git"),
            "GIT_CONFIG_PARAMETERS": "'core.hooksPath=/decoy/hooks'",
            "GIT_CONFIG_COUNT": "1",
            "GIT_CONFIG_KEY_0": "core.hooksPath",
            "GIT_CONFIG_VALUE_0": str(decoy / "hooks"),
            "MIZANO_FIXTURE_SENTINEL": "sentinel-git-push-keep",
        }

        with mock.patch.dict(os.environ, decoy_env):
            # Target repository where fixture operations should take place
            target = tmp / "target_repo"
            target.mkdir()
            git(target, "init", "-q", "-b", "master")
            git(target, "config", "user.email", "target@example.com")
            git(target, "config", "user.name", "target")
            git(target, "config", "commit.gpgsign", "false")
            (target / "target.txt").write_text("target content")
            git(target, "add", "target.txt")
            git(target, "commit", "-q", "-m", "target commit")

            target_head = git(target, "rev-parse", "HEAD")
            self.assertNotEqual(target_head, decoy_head)
            self.assertTrue((target / "target.txt").exists())

            # Confirm that core.hooksPath was not polluted by config injection
            core_hooks = git(target, "config", "--get", "core.hooksPath", env={}) if subprocess.run(
                ["git", "config", "--get", "core.hooksPath"],
                cwd=target, env=sanitized_git_env(), capture_output=True, text=True,
            ).returncode == 0 else ""
            self.assertNotIn("decoy", core_hooks)

            # Bare remote for push test
            bare_remote = tmp / "bare.git"
            bare_remote.mkdir()
            git(bare_remote, "init", "--bare", "-q")
            git(target, "remote", "add", "origin", str(bare_remote))
            # Test fixture git pushing to bare remote
            git(target, "push", "-q", "origin", "master")

        # Verify decoy repository remained completely untouched (HEAD, refs, index, config)
        self.assertEqual(git(decoy, "rev-parse", "HEAD"), decoy_head)
        self.assertEqual((decoy / ".git" / "index").read_bytes(), decoy_index)
        self.assertEqual(git(decoy, "show-ref"), decoy_refs)
        self.assertEqual(
            hashlib.sha256((decoy / ".git" / "config").read_bytes()).hexdigest(),
            decoy_config_hash,
            "Decoy config must remain byte-identical",
        )
        self.assertFalse((decoy / "target.txt").exists())

    def test_run_hook_isolates_from_inherited_git_env(self):
        tmp = Path(tempfile.mkdtemp(prefix="mz-hook-iso-"))
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)

        decoy = tmp / "decoy_repo"
        decoy.mkdir()
        git(decoy, "init", "-q", "-b", "master")
        git(decoy, "config", "user.email", "decoy@example.com")
        git(decoy, "config", "user.name", "decoy")
        git(decoy, "config", "commit.gpgsign", "false")
        (decoy / "decoy.txt").write_text("decoy content")
        git(decoy, "add", "decoy.txt")
        git(decoy, "commit", "-q", "-m", "decoy initial")

        decoy_head = git(decoy, "rev-parse", "HEAD")
        decoy_index = (decoy / ".git" / "index").read_bytes()
        decoy_config_hash = hashlib.sha256((decoy / ".git" / "config").read_bytes()).hexdigest()

        env_log = tmp / "hook_env.log"
        git_dir_log = tmp / "hook_git_dir.log"
        # Script logs variable NAMES only, never values (FR-006 secrets policy)
        # Also logs resolved git directory inside the hook
        hook_py = (
            f"#!/usr/bin/env python3\n"
            f"import os, subprocess\n"
            f"from pathlib import Path\n"
            f"names = sorted(os.environ.keys())\n"
            f"Path({str(env_log)!r}).write_text('\\n'.join(names))\n"
            f"git_dir = subprocess.run(['git', 'rev-parse', '--absolute-git-dir'], capture_output=True, text=True).stdout.strip()\n"
            f"Path({str(git_dir_log)!r}).write_text(git_dir)\n"
        )

        target = tmp / "target_repo"
        target.mkdir()
        git(target, "init", "-q", "-b", "master")
        git(target, "config", "user.email", "target@example.com")
        git(target, "config", "user.name", "target")
        git(target, "config", "commit.gpgsign", "false")
        (target / ".husky").mkdir()
        hook_path = target / ".husky" / "pre-commit"
        hook_path.write_text(hook_py)
        hook_path.chmod(0o755)

        decoy_env = {
            "GIT_DIR": str(decoy / ".git"),
            "GIT_WORK_TREE": str(decoy),
            "GIT_INDEX_FILE": str(decoy / ".git" / "index"),
            "GIT_OBJECT_DIRECTORY": str(decoy / ".git" / "objects"),
            "GIT_COMMON_DIR": str(decoy / ".git"),
            "GIT_CONFIG_PARAMETERS": "'core.hooksPath=/decoy/hooks'",
            "GIT_CONFIG_COUNT": "1",
            "GIT_CONFIG_KEY_0": "core.hooksPath",
            "GIT_CONFIG_VALUE_0": str(decoy / "hooks"),
            "MIZANO_TEST_SENTINEL": "hook-sentinel-value",
        }

        with mock.patch.dict(os.environ, decoy_env):
            # Run hook through runner in target repo
            clean = sanitized_git_env(overrides={"EXTRA_OVERRIDE": "present"})
            res = subprocess.run(
                [str(hook_path)],
                cwd=target, env=clean, capture_output=True, text=True, timeout=60,
            )
            self.assertEqual(res.returncode, 0, f"Hook failed: {res.stdout} {res.stderr}")

        received_names = set(env_log.read_text().splitlines())
        local_vars_out = subprocess.run(
            ["git", "rev-parse", "--local-env-vars"],
            capture_output=True, text=True, check=True,
        ).stdout.splitlines()
        local_vars = {v.strip() for v in local_vars_out if v.strip()}

        # Verify no repo-locating variables leaked to the hook
        leaked = received_names.intersection(local_vars)
        self.assertEqual(leaked, set(), f"Leaked local Git variables: {leaked}")
        self.assertNotIn("GIT_CONFIG_PARAMETERS", received_names)
        self.assertNotIn("GIT_CONFIG_COUNT", received_names)
        self.assertIn("MIZANO_TEST_SENTINEL", received_names)
        self.assertIn("EXTRA_OVERRIDE", received_names)

        # Verify git directory resolved inside hook is the target repo's git dir, not decoy
        resolved_git_dir = Path(git_dir_log.read_text()).resolve()
        target_git_dir = (target / ".git").resolve()
        self.assertEqual(resolved_git_dir, target_git_dir, "Hook git dir must resolve to target repo")

        # Verify decoy repository remained untouched
        self.assertEqual(git(decoy, "rev-parse", "HEAD"), decoy_head)
        self.assertEqual((decoy / ".git" / "index").read_bytes(), decoy_index)
        self.assertEqual(
            hashlib.sha256((decoy / ".git" / "config").read_bytes()).hexdigest(),
            decoy_config_hash,
            "Decoy config must remain byte-identical",
        )

    def test_git_env_clean_module_attribute_is_dynamic(self):
        import scripts.test_husky_hooks as mod

        with mock.patch.dict(os.environ, {"GIT_DIR": "/decoy/.git", "SENTINEL_DYN_A": "alpha"}):
            env_a = mod.GIT_ENV_CLEAN
            self.assertNotIn("GIT_DIR", env_a)
            self.assertEqual(env_a.get("SENTINEL_DYN_A"), "alpha")

        with mock.patch.dict(os.environ, {"GIT_DIR": "/decoy/.git", "SENTINEL_DYN_B": "beta"}):
            env_b = mod.GIT_ENV_CLEAN
            self.assertNotIn("GIT_DIR", env_b)
            self.assertEqual(env_b.get("SENTINEL_DYN_B"), "beta")
            self.assertNotIn("SENTINEL_DYN_A", env_b)

    def test_git_env_removes_keys_with_none_override(self):
        with mock.patch.dict(os.environ, {"KEEP_ME": "yes", "REMOVE_ME": "temporary"}):
            scrubbed = sanitized_git_env(overrides={"REMOVE_ME": None, "ADDED": "new"})
            self.assertIn("KEEP_ME", scrubbed)
            self.assertEqual(scrubbed.get("ADDED"), "new")
            self.assertNotIn("REMOVE_ME", scrubbed)


if __name__ == "__main__":
    unittest.main()