"""Unit and behavioral tests for evidence document freshness and AC5 validation.

Spec: 398-followup-review-findings
Run: python3 -m unittest discover -s tests -p 'test_evidence_freshness.py'
"""

from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.test_evidence_freshness import *  # noqa: F401, F403


if __name__ == "__main__":
    unittest.main()
