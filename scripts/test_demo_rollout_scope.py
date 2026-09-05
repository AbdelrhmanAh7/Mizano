"""Execute the actual inline rollout gate with bounded, offline GitHub/git fixtures.

Run: python3 -m unittest discover -s scripts -p 'test_demo_rollout_scope.py'
The workflow's Python is extracted without copying/reimplementing its decisions.
No GitHub calls, repository changes, application builds or deployment occur.
"""

import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import textwrap
from types import SimpleNamespace
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github/workflows/deploy.yml"
EXEMPTION = ROOT / "docs/planning/rollout-exemption.json"
BASELINE = "f8bf699319a37198b585cb67b650069da4c6cd4d"


class RolloutScopeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow_bytes = WORKFLOW.read_bytes()
        workflow_text = cls.workflow_bytes.decode("utf-8")
        start = "python - <<'PYTHON'\n"
        if workflow_text.count(start) != 1:
            raise AssertionError("Expected exactly one inline Python scope gate")
        code = workflow_text.split(start, 1)[1].split("\n          PYTHON", 1)[0]
        cls.code = compile(textwrap.dedent(code), str(WORKFLOW) + ":rollout-scope", "exec")
        cls.exemption = json.loads(EXEMPTION.read_text(encoding="utf-8"))

    def run_gate(self, files, *, event="workflow_run", content=None, net_files=None,
                 altered_workflow=False, git_error=None, missing_exemption=False):
        """Expose changed history separately from net-tree and final-commit diffs."""
        read_text = json.dumps(self.exemption) if content is None else content

        def path_factory(path):
            if path == "docs/planning/rollout-exemption.json":
                if missing_exemption:
                    raise FileNotFoundError("Fixture exemption is absent")
                return SimpleNamespace(read_text=lambda: read_text)
            if path == ".github/workflows/deploy.yml":
                value = self.workflow_bytes + (b"\n# Changed runtime deployment command\n" if altered_workflow else b"")
                return SimpleNamespace(read_bytes=lambda: value)
            raise AssertionError("Unexpected scope-gate filesystem read")

        def git_diff(command, **kwargs):
            if command == ["git", "log", "--format=", "--name-only", "--full-history", "-m", BASELINE + "..HEAD"]:
                return "\n\n".join(files) + "\n"
            if command == ["git", "diff", "--name-only", BASELINE, "HEAD"]:
                return "\n".join(files if net_files is None else net_files)
            if "HEAD^" in command or "HEAD^..HEAD" in command:
                return "README.md\n"  # The final commit contains only documentation.
            raise AssertionError("Gate used an unrecognized change range")

        writer = mock.mock_open()
        with mock.patch("pathlib.Path", side_effect=path_factory) as paths, \
                mock.patch("subprocess.run", side_effect=git_error) as ancestry, \
                mock.patch("subprocess.check_output", side_effect=git_diff) as diff, \
                mock.patch.dict(os.environ, {"EVENT_NAME": event, "GITHUB_OUTPUT": "/fixture/github-output"}, clear=True), \
                mock.patch("builtins.open", writer), \
                mock.patch("sys.stdout", new_callable=io.StringIO):
            exec(self.code, {})
        writer.assert_called_once_with("/fixture/github-output", "a")
        written = "".join(call.args[0] for call in writer().write.call_args_list)
        self.assertIn(written, ("should_deploy=true\n", "should_deploy=false\n"))
        return written == "should_deploy=true\n", ancestry, diff, paths

    def test_checked_in_exemption_matches_workflow_and_exact_test_path(self):
        self.assertEqual(self.exemption["baseline"], BASELINE)
        self.assertEqual(self.exemption["deployment_workflow_sha256"], hashlib.sha256(self.workflow_bytes).hexdigest())
        self.assertIn("scripts/test_demo_rollout_scope.py", self.exemption["planning_paths"])
        self.assertFalse(any("*" in path for path in self.exemption["planning_paths"]))

    def test_reviewed_planning_only_change_skips_rollout(self):
        deploy, ancestry, diff, _ = self.run_gate(["README.md", "docs/planning/demo-plan.json", "scripts/test_demo_rollout_scope.py"])
        self.assertFalse(deploy)
        ancestry.assert_called_once_with(["git", "merge-base", "--is-ancestor", BASELINE, "HEAD"], check=True)
        diff.assert_called_once_with(["git", "log", "--format=", "--name-only", "--full-history", "-m", BASELINE + "..HEAD"], text=True)

    def test_exact_reviewed_workflow_change_is_exempt(self):
        deploy, _, _, _ = self.run_gate([".github/workflows/deploy.yml", "docs/planning/rollout-exemption.json"])
        self.assertFalse(deploy)

    def test_runtime_earlier_commit_and_documentation_final_commit_deploys(self):
        # If the gate regresses to HEAD^..HEAD, the fixture returns only README and this fails.
        deploy, _, _, _ = self.run_gate(["apps/api/src/main.ts", "README.md"])
        self.assertTrue(deploy)

    def test_reverted_runtime_change_remains_detected_in_history(self):
        # The runtime change and its reversal cancel in a net-tree diff, but an
        # instance running the intermediate runtime still needs the reversal.
        deploy, _, _, _ = self.run_gate(
            ["apps/api/src/main.ts", "apps/api/src/main.ts", "README.md"],
            net_files=["README.md"],
        )
        self.assertTrue(deploy)

    def test_future_deployment_workflow_change_fails_hash_exemption(self):
        deploy, _, _, _ = self.run_gate([".github/workflows/deploy.yml", "README.md"], altered_workflow=True)
        self.assertTrue(deploy)

    def test_unlisted_document_or_runtime_path_is_not_blanket_exempt(self):
        for path in ("docs/runtime-config.json", "apps/api/prompts/runtime.md", "docs/new-file.md", "docker-compose.production.yml"):
            with self.subTest(path=path):
                deploy, _, _, _ = self.run_gate([path])
                self.assertTrue(deploy)

    def test_missing_or_invalid_exemption_conservatively_deploys(self):
        for options in ({"missing_exemption": True}, {"content": "not-json"}, {"content": "{}"}):
            with self.subTest(options=options):
                deploy, _, _, _ = self.run_gate(["README.md"], **options)
                self.assertTrue(deploy)

    def test_malformed_exemption_shape_conservatively_deploys(self):
        malformed = [None, [], {**self.exemption, "planning_paths": None},
                     {**self.exemption, "planning_paths": [["README.md"]]}]
        for value in malformed:
            with self.subTest(value_type=type(value).__name__):
                deploy, _, _, _ = self.run_gate(["README.md"], content=json.dumps(value))
                self.assertTrue(deploy)

    def test_unverified_ancestry_or_git_failure_conservatively_deploys(self):
        for error in (subprocess.CalledProcessError(1, ["git", "merge-base"]), OSError("git unavailable")):
            with self.subTest(error=type(error).__name__):
                deploy, _, diff, _ = self.run_gate(["README.md"], git_error=error)
                self.assertTrue(deploy)
                diff.assert_not_called()

    def test_empty_change_range_does_not_authorize_skip(self):
        deploy, _, _, _ = self.run_gate([])
        self.assertTrue(deploy)

    def test_manual_and_release_events_deploy_without_scope_reads(self):
        for event in ("workflow_dispatch", "release"):
            with self.subTest(event=event):
                deploy, ancestry, diff, paths = self.run_gate(["README.md"], event=event)
                self.assertTrue(deploy)
                ancestry.assert_not_called()
                diff.assert_not_called()
                paths.assert_not_called()


if __name__ == "__main__":
    unittest.main()
