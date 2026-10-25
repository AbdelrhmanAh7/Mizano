"""Behavioral tests for _lint_staged.js git diff handling (#515).

Run: python3 -m unittest discover -s tests -p 'test_lint_staged.py'
"""

import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "_lint_staged.js"
REAL_GIT = shutil.which("git")
NODE = shutil.which("node")


@unittest.skipUnless(NODE and REAL_GIT, "node and git are required")
class LintStagedGitFailureTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="lint-staged-test-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.repo = self.tmp / "repo"
        self.repo.mkdir()
        shutil.copy(SCRIPT, self.repo / "_lint_staged.js")
        for rel in ("eslint/bin/eslint.js", "prettier/bin/prettier.cjs"):
            stub = self.repo / "node_modules" / rel
            stub.parent.mkdir(parents=True)
            stub.write_text("process.exit(0);\n")
        self.git("init", "-q")
        self.git("config", "user.email", "t@example.com")
        self.git("config", "user.name", "t")
        target = self.repo / "apps" / "api" / "a.ts"
        target.parent.mkdir(parents=True)
        target.write_text("const a = 1;\n")
        self.git("add", ".")
        self.git("commit", "-qm", "init", "--no-verify")
        # a staged hunk plus a separate unstaged hunk in the same file
        target.write_text("const a = 2;\n")
        self.git("add", "apps/api/a.ts")
        target.write_text("const a = 3;\n")
        self.target = target

    def git(self, *args):
        return subprocess.run(
            [REAL_GIT, *args], cwd=self.repo, check=True, capture_output=True, text=True
        ).stdout

    def shim_git(self, fail_on):
        bin_dir = self.tmp / "bin"
        bin_dir.mkdir()
        shim = bin_dir / "git"
        shim.write_text(
            "#!/bin/sh\n"
            f'case "$*" in *{fail_on}*) echo "fatal: simulated {fail_on} failure" >&2; exit 128;; esac\n'
            f'exec "{REAL_GIT}" "$@"\n'
        )
        shim.chmod(0o755)
        return {**os.environ, "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"}

    def run_script(self, env):
        return subprocess.run(
            [NODE, "_lint_staged.js"], cwd=self.repo, env=env, capture_output=True, text=True
        )

    def test_unstaged_diff_failure_fails_closed_and_keeps_index(self):
        before = self.git("show", ":apps/api/a.ts")
        result = self.run_script(self.shim_git("--no-ext-diff"))
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("simulated --no-ext-diff failure", result.stderr)
        self.assertEqual(self.git("show", ":apps/api/a.ts"), before)
        self.assertEqual(self.target.read_text(), "const a = 3;\n")

    def test_partially_staged_file_is_not_restaged_on_success(self):
        result = self.run_script(os.environ.copy())
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.git("show", ":apps/api/a.ts"), "const a = 2;\n")

    def test_staged_diff_failure_still_exits_nonzero(self):
        result = self.run_script(self.shim_git("--cached"))
        self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
