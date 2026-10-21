"""Regression and consistency tests for evidence document freshness and tested head SHAs.

Run: python3 -m unittest discover -s scripts -p 'test_evidence_freshness.py'
"""

from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
REVIEW_LESSONS = ROOT / "docs" / "agents" / "review-lessons.md"
EVIDENCE_DIR = ROOT / "docs" / "evidence"


def find_stale_exclusivity_markers(text: str, commit_history: list[str] = None) -> list[str]:
    """Check whether an evidence header falsely asserts exclusivity when later commits exist.

    If text asserts '(the only later commit is this file)' but commit_history
    contains subsequent code/test changes, flag the violation.
    """
    violations = []
    has_exclusivity_claim = bool(
        re.search(r"\(the only later commit is this file\)", text, re.IGNORECASE)
        or re.search(r"\(final test code; the only later commit is this file\)", text, re.IGNORECASE)
    )
    if has_exclusivity_claim and commit_history:
        # If any later commit touched code or tests, exclusivity is violated
        for commit_info in commit_history:
            violations.append(f"Header claims exclusivity but subsequent commit exists: {commit_info}")
    return violations


def extract_tested_shas(text: str) -> list[str]:
    """Extract tested and base commit SHAs from markdown evidence text."""
    pattern = (
        r"(?:Tested code SHA|Tested head|Tested head SHA|Commit SHA|Base commit|Base|tested code commit)"
        r"[:\s*]+`?([0-9a-fA-F]{7,40})`?"
    )
    return re.findall(pattern, text)


class EvidenceFreshnessTests(unittest.TestCase):
    def test_review_lessons_records_rerun_evidence_rule(self):
        """Review lessons must include the rule to re-run evidence checks against the final PR head."""
        content = REVIEW_LESSONS.read_text(encoding="utf-8")
        self.assertIn("Re-run evidence checks against the final PR head", content)
        self.assertRegex(
            content,
            r"Re-run evidence checks against the final PR head.*(?:stale|fresh|tested code head)",
        )

    def test_existing_evidence_docs_have_valid_shas(self):
        """All docs/evidence/*/EVIDENCE.md documents must have valid git SHAs in headers."""
        evidence_files = list(EVIDENCE_DIR.glob("*/EVIDENCE.md"))
        self.assertGreater(len(evidence_files), 0, "At least one evidence file must exist")
        for ep in evidence_files:
            content = ep.read_text(encoding="utf-8")
            shas = extract_tested_shas(content)
            self.assertGreater(
                len(shas), 0, f"{ep.relative_to(ROOT)} should contain at least one tested or base SHA"
            )
            for s in shas:
                self.assertTrue(
                    7 <= len(s) <= 40 and re.fullmatch(r"[0-9a-fA-F]+", s),
                    f"{ep.relative_to(ROOT)} has invalid SHA format: {s}",
                )

    def test_planted_stale_exclusivity_header_detected(self):
        """Planted header claiming 'only later commit is this file' fails when subsequent code commits exist."""
        stale_header = (
            "- **Tested code SHA**: `8364be19342a72f6195145758e9d1d9638cc937e` "
            "(final test code; the only later commit is this file)\n"
        )
        later_commits = [
            "Round 4 changed e2e-army/153-e2e-army-gate.e2e.ts and bank-accounts.service.ts",
            "Round 5 merged master (99abae33)",
        ]
        violations = find_stale_exclusivity_markers(stale_header, later_commits)
        self.assertEqual(len(violations), 2)
        self.assertIn("8364be1", stale_header)
        self.assertTrue(any("e2e-army-gate.e2e.ts" in v for v in violations))

    def test_valid_head_evidence_passes(self):
        """Fresh evidence headers without false exclusivity claims pass cleanly."""
        valid_header = (
            "- **Base**: `origin/master` (`4c006386`)\n"
            "- **Tested Head**: `91778ac4`\n"
        )
        violations = find_stale_exclusivity_markers(valid_header, ["docs: record verification"])
        self.assertEqual(violations, [])

    def test_issue_327_evidence_contract(self):
        """docs/evidence/327/EVIDENCE.md must exist and define AC1-AC4 with exit codes and supersedes notice."""
        evidence_327 = EVIDENCE_DIR / "327" / "EVIDENCE.md"
        self.assertTrue(evidence_327.exists(), "docs/evidence/327/EVIDENCE.md must exist")
        content = evidence_327.read_text(encoding="utf-8")
        self.assertIn("Supersedes part of #268", content)
        self.assertIn("AC1", content)
        self.assertIn("AC2", content)
        self.assertIn("AC3", content)
        self.assertIn("AC4", content)
        self.assertIn("Exit Code", content)


if __name__ == "__main__":
    unittest.main()
