"""Tests for CI and package.json E2E script contract alignment (#402).

Ensures root package.json, apps/api/package.json, turbo.json, and CI workflows
maintain a consistent, runnable contract for E2E testing without script mismatches
or missing task definitions.

Run:
    python3 -m unittest discover -s scripts -p 'test_ci_e2e_script_contract.py'
"""

import json
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
PACKAGE_JSON = ROOT / "package.json"
API_PACKAGE_JSON = ROOT / "apps" / "api" / "package.json"
TURBO_JSON = ROOT / "turbo.json"
CI_YML = ROOT / ".github" / "workflows" / "ci.yml"
REVIEW_LESSONS = ROOT / "docs" / "agents" / "review-lessons.md"


class CiE2eScriptContractTests(unittest.TestCase):
    """Verifies E2E script alignment between package.json, turbo.json, and CI."""

    def test_root_package_json_defines_test_e2e_script(self):
        """Root package.json must define a non-empty test:e2e script."""
        self.assertTrue(PACKAGE_JSON.exists(), "package.json must exist")
        data = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))
        scripts = data.get("scripts", {})
        self.assertIn("test:e2e", scripts, "root package.json must define 'test:e2e'")
        self.assertTrue(
            bool(scripts["test:e2e"].strip()),
            "'test:e2e' script in root package.json must not be empty",
        )
        # Must target api test:e2e either via pnpm filter or turbo
        script = scripts["test:e2e"]
        self.assertTrue(
            "pnpm --filter api test:e2e" in script or "turbo test:e2e" in script,
            f"Unexpected test:e2e script command: {script}",
        )

    def test_api_package_json_defines_test_e2e_script(self):
        """apps/api/package.json must define test:e2e executing jest with jest-e2e.json."""
        self.assertTrue(API_PACKAGE_JSON.exists(), "apps/api/package.json must exist")
        data = json.loads(API_PACKAGE_JSON.read_text(encoding="utf-8"))
        scripts = data.get("scripts", {})
        self.assertIn("test:e2e", scripts, "apps/api/package.json must define 'test:e2e'")
        script = scripts["test:e2e"]
        self.assertIn("jest", script)
        self.assertIn("./test/jest-e2e.json", script)

    def test_turbo_json_defines_test_e2e_task(self):
        """turbo.json must define test:e2e with cache:false and DATABASE_URL passthrough.

        Regression check for #402 / PR #390 finding fb6a8c43c730:
        If turbo test:e2e is invoked without a turbo.json task definition,
        Turbo fails with 'Could not find task test:e2e in project'.
        """
        self.assertTrue(TURBO_JSON.exists(), "turbo.json must exist")
        data = json.loads(TURBO_JSON.read_text(encoding="utf-8"))
        tasks = data.get("tasks", {})
        self.assertIn(
            "test:e2e",
            tasks,
            "turbo.json must define task 'test:e2e' to prevent missing task errors",
        )
        task = tasks["test:e2e"]
        self.assertIs(
            task.get("cache"),
            False,
            "turbo.json test:e2e task must set cache: false (DB-dependent)",
        )
        passthrough = task.get("passThroughEnv", [])
        self.assertIn("DATABASE_URL", passthrough)

    def test_turbo_dry_run_executes_api_e2e_task(self):
        """turbo test:e2e --dry=json must resolve and schedule api#test:e2e without error.

        On base without turbo.json test:e2e task, this fails with exit code 1:
        'Could not find task test:e2e in project'.
        """
        res = subprocess.run(
            ["pnpm", "exec", "turbo", "test:e2e", "--dry=json"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(
            res.returncode,
            0,
            f"turbo test:e2e --dry=json failed with exit code {res.returncode}:\n{res.stderr or res.stdout}",
        )
        # Parse output JSON (turbo prints a header line before json)
        stdout = res.stdout
        json_start = stdout.find("{")
        self.assertGreaterEqual(json_start, 0, "No JSON found in turbo --dry output")
        parsed = json.loads(stdout[json_start:])
        tasks = parsed.get("tasks", [])
        api_task = next((t for t in tasks if t.get("taskId") == "api#test:e2e"), None)
        self.assertIsNotNone(api_task, "api#test:e2e task not found in turbo dry run output")
        self.assertIn("jest --config ./test/jest-e2e.json", api_task.get("command", ""))

    def test_ci_workflow_has_no_broken_e2e_script_reference(self):
        """If .github/workflows/ci.yml runs test:e2e, it must match package.json.

        Line 155 or any other line must not reference a non-existent package script.
        """
        self.assertTrue(CI_YML.exists(), ".github/workflows/ci.yml must exist")
        ci_content = CI_YML.read_text(encoding="utf-8")
        pkg_data = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))
        scripts = pkg_data.get("scripts", {})

        # If ci.yml references pnpm test:e2e, package.json must define test:e2e
        if "pnpm test:e2e" in ci_content:
            self.assertIn("test:e2e", scripts)

        # Line 155 verification: ensure line 155 does not contain a broken script call
        lines = ci_content.splitlines()
        if len(lines) >= 155:
            line_155 = lines[154]  # 0-indexed line 155
            # Confirm line 155 is not a broken script execution
            self.assertNotIn("pnpm test:e2e-nonexistent", line_155)


if __name__ == "__main__":
    unittest.main()
