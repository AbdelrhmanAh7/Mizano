"""Run the real .husky/pre-push (and its watchdog) against a throwaway git repo.

Run: python3 -m unittest discover -s scripts -p 'test_husky_hooks.py'
turbo, tsc, jest and prisma are recording stubs, so no packages are installed, built or tested
and nothing leaves the temp directory.
"""

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
PRE_PUSH = ROOT / ".husky" / "pre-push"
PRE_COMMIT = ROOT / ".husky" / "pre-commit"
ZERO = "0" * 40


def git(cwd, *args):
    return subprocess.run(
        ["git", *args], cwd=cwd, check=True, capture_output=True, text=True
    ).stdout.strip()


def pid_alive(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
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
        clean = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
        clean.pop("SKIP_LOCAL_CI", None)
        clean.update(env)
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
        head = self.commit("package.json", "{}")
        result, calls = self.push([self.line(head, self.base)])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls, ["turbo run type-check test --output-logs=errors-only"])

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
        self.assertEqual(result.returncode, 124, result.stdout + result.stderr)
        self.assertLess(time.monotonic() - started, 30)
        self.assertIn("exceeded the 2s limit", result.stderr)
        for pid in map(int, pids.read_text().split()):
            for _ in range(20):
                if not pid_alive(pid):
                    break
                time.sleep(0.1)
            self.assertFalse(pid_alive(pid), f"pid {pid} survived the watchdog")


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
        clean = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
        clean.update(env)
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
        self.assertEqual(result.returncode, 124, result.stdout + result.stderr)
        self.assertLess(time.monotonic() - started, 30)
        self.assertIn("exceeded the 2s limit", result.stderr)


if __name__ == "__main__":
    unittest.main()
