"""Consistency and verification tests for docs/evidence/94/EVIDENCE.md.

Run: python3 -m unittest discover -s scripts -p 'test_evidence_94_docs.py'
"""

from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE_PATH = ROOT / "docs" / "evidence" / "94" / "EVIDENCE.md"


class Evidence94DocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.content = EVIDENCE_PATH.read_text(encoding="utf-8")

    def test_tested_head_summary_marks_full_e2e_and_ci_full_unknown(self):
        """The tested head summary must report full seeded E2E and pnpm ci:full as unknown."""
        # Must not imply tested head ran full seeded E2E or ci:full
        pattern = r"Tested head:.*Full seeded E2E and `pnpm ci:full`.*unknown"
        self.assertRegex(self.content, re.compile(pattern, re.DOTALL))

    def test_older_output_explicitly_does_not_verify_later_heads(self):
        """Historical runs at 7955496 must state they do not verify e1d4a47 or later heads."""
        pattern = r"do not imply that runs at `7955496` verify `e1d4a47`|do not verify `e1d4a47` or later heads"
        self.assertRegex(self.content, pattern)

    def test_red_section_reports_full_e2e_and_ci_full_unknown(self):
        """Red section must note that full seeded E2E and ci:full were not run against master's code."""
        red_section_match = re.search(r"### Red: the new tests against master's code(.*?)(?=### Green|\Z)", self.content, re.DOTALL)
        self.assertIsNotNone(red_section_match, "Red section not found")
        red_text = red_section_match.group(1)
        self.assertIn("unknown", red_text.lower(), "Red section must mark unrun full seeded E2E/ci:full as unknown")

    def test_green_section_reports_full_e2e_and_ci_full_unknown(self):
        """Green at 76ed8e8 must mark full seeded E2E and ci:full as unknown at the tested head."""
        green_section_match = re.search(r"### Green at `76ed8e8`(.*?)(?=### Historical|\Z)", self.content, re.DOTALL)
        self.assertIsNotNone(green_section_match, "Green section not found")
        green_text = green_section_match.group(1)
        self.assertIn("unknown", green_text.lower(), "Green section must report full seeded E2E and ci:full as unknown")
        # Ensure 7955496 full seeded output is not placed inside 'Green at 76ed8e8'
        self.assertNotIn("PASS test/purchases.e2e-spec.ts", green_text,
                         "Full seeded E2E output must not be nested under 'Green at 76ed8e8'")

    def test_historical_heading_explicitly_marks_unknown_for_subsequent_heads(self):
        """Historical reference heading must list e1d4a47, cf6f625, and 451cc181 as unknown."""
        pattern = r"### Historical reference runs at `7955496` \(result unknown at `e1d4a47`, `cf6f625`, `451cc181`\)"
        self.assertRegex(self.content, pattern)


if __name__ == "__main__":
    unittest.main()
