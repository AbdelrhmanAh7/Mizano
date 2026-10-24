"""Guards .github/workflows/ci.yml against jobs exceeding 5m and unvetted builds.

Owner rule: Every standard job in CI must stay under 5 minutes (timeout-minutes <= 5).
Docker builds on cold runners exceed 5 minutes (measured 8-12m) and were extracted
to docs/follow-up-docker-validation.md until proven under 5m cold.
Standard library only, so the CI lint job can run it without dependencies.
"""

import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
CI_YML = ROOT / ".github" / "workflows" / "ci.yml"


def parse_ci_jobs(ci_text: str):
    """Parse jobs, their display names, and timeouts from workflow yaml text."""
    in_jobs = False
    jobs = {}
    current_job = None

    for line in ci_text.splitlines():
        if line.startswith("jobs:"):
            in_jobs = True
            continue
        if in_jobs and line and not line.startswith(" ") and not line.startswith("#"):
            in_jobs = False
            current_job = None
        if in_jobs:
            m_job = re.match(r"^  ([a-zA-Z0-9_-]+):\s*$", line)
            if m_job:
                current_job = m_job.group(1)
                jobs[current_job] = {}
                continue
            if current_job:
                m_name = re.match(r"^    name:\s*(.+)$", line)
                if m_name:
                    jobs[current_job]["name"] = m_name.group(1).strip()
                m_timeout = re.match(r"^    timeout-minutes:\s*([0-9]+)", line)
                if m_timeout:
                    jobs[current_job]["timeout"] = int(m_timeout.group(1))

    return jobs


def find_overlong_jobs(jobs, max_timeout=5):
    """Return job names where timeout-minutes is missing or > max_timeout."""
    overlong = []
    for name, attrs in jobs.items():
        timeout = attrs.get("timeout")
        if timeout is None or timeout > max_timeout:
            overlong.append((name, timeout))
    return overlong


class CiWorkflowConfigTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ci_text = CI_YML.read_text(encoding="utf-8")
        cls.jobs = parse_ci_jobs(cls.ci_text)

    def test_every_job_strictly_enforces_timeout_under_or_equal_to_5_minutes(self):
        overlong = find_overlong_jobs(self.jobs, max_timeout=5)
        self.assertEqual(
            overlong,
            [],
            f"Every CI job must declare timeout-minutes <= 5 (owner rule). Violations: {overlong}",
        )

    def test_docker_build_and_filter_jobs_are_not_present_in_ci(self):
        forbidden_jobs = {"docker-build", "docker_build", "filter"}
        found = forbidden_jobs.intersection(self.jobs.keys())
        self.assertEqual(
            found,
            set(),
            "docker-build and filter must remain extracted to docs/follow-up-docker-validation.md "
            "until cold runs are proven under 5 minutes.",
        )

    def test_check_names_are_stable_for_automerge_gates(self):
        expected_names = {
            "gate": "CI Gate",
            "install": "Install Dependencies",
            "lint": "Lint & Type Check",
            "test": "Unit Tests",
            "build": "Build",
        }
        for job_id, expected_name in expected_names.items():
            self.assertIn(job_id, self.jobs, f"Job {job_id} must exist in ci.yml")
            self.assertEqual(
                self.jobs[job_id].get("name"),
                expected_name,
                f"Job {job_id} must have display name '{expected_name}'",
            )

    def test_guard_flags_overlong_timeout(self):
        mock_jobs = {
            "test": {"name": "Test", "timeout": 5},
            "slow": {"name": "Slow Job", "timeout": 30},
            "missing": {"name": "No Timeout"},
        }
        self.assertEqual(
            find_overlong_jobs(mock_jobs, max_timeout=5),
            [("slow", 30), ("missing", None)],
        )

    def test_permissions_are_least_privilege(self):
        self.assertIn("permissions:\n  contents: read", self.ci_text)
        self.assertNotIn("pull-requests: read", self.ci_text)


if __name__ == "__main__":
    unittest.main()
