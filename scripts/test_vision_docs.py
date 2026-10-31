"""Offline consistency tests for docs/vision.md and docs/backlog-restructure.md.

Run: python3 -m unittest discover -s scripts -p 'test_vision_docs.py'

The backlog restructure restated the goal milestones, demo issues and counts
from docs/vision.md, so the two docs must agree with each other, with the
live GitHub milestones, and with their own arithmetic. The milestone titles
are pinned from the live milestones (verified 2026-10-11 with
`gh api repos/AbdelrhmanAh7/Mizano/milestones/<number>`); when a milestone
is renamed on GitHub, the docs and this pin must be updated in the same
change. No network, GitHub calls or repository writes.
"""

import re
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
VISION = (ROOT / "docs" / "vision.md").read_text(encoding="utf-8")
BACKLOG = (ROOT / "docs" / "backlog-restructure.md").read_text(encoding="utf-8")

# Live titles of the six goal milestones, in milestone-number order.
EXPECTED_TITLES = {
    13: "MZ G1 · Safe, green master (P0 blockers)",
    14: "MZ G2 · Stable: 15/15 pilot features green",
    15: "MZ G3 · Bill scan to posted entry, feature-complete",
    16: "MZ G4 · Pilot launch: 3 accountants post a scanned bill",
    17: "MZ G5 · FlowLine integration API (keys + webhooks)",
    18: "MZ G6 · Post-pilot: Telegram intake, VAT and hardening",
}

# Demo (goal checklist) issue per milestone number; a swap in both docs must fail.
EXPECTED_DEMOS = {13: 175, 14: 176, 15: 177, 16: 178, 17: 179, 18: 180}

# | [MZ G1 · ...](https://github.com/AbdelrhmanAh7/Mizano/milestone/13) | due | criteria | #175 |
GOAL_ROW = re.compile(
    r"\[(MZ G\d[^\]]*)\]\(https://github\.com/AbdelrhmanAh7/Mizano/milestone/(\d+)\)"
    r"[^\n]*\|\s*#(\d+)\s*\|\s*$",
    re.M,
)
# - [MZ G1 · ...](https://github.com/AbdelrhmanAh7/Mizano/milestone/13) — due ... — demo #175
GOAL_BULLET = re.compile(
    r"^-\s*\[(MZ G\d[^\]]*)\]\(https://github\.com/AbdelrhmanAh7/Mizano/milestone/(\d+)\)"
    r".*demo #(\d+)\s*$",
    re.M,
)
COUNTS_ROW = re.compile(r"^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$", re.M)


def goal_rows(text):
    return {int(number): (title, int(demo)) for title, number, demo in GOAL_ROW.findall(text)}


def goal_bullets(text):
    return {int(number): (title, int(demo)) for title, number, demo in GOAL_BULLET.findall(text)}


def counts_table(text):
    return {label: (before, after) for label, before, after in COUNTS_ROW.findall(text)}


class VisionDocsTests(unittest.TestCase):
    def test_goal_titles_match_the_live_milestones(self):
        """The docs restate milestone titles; a GitHub rename must reach both docs."""
        for source, goals in (("docs/vision.md", goal_rows(VISION)), ("docs/backlog-restructure.md", goal_bullets(BACKLOG))):
            self.assertEqual(sorted(goals), sorted(EXPECTED_TITLES), f"milestone set drifted in {source}")
            for number, (title, _demo) in goals.items():
                self.assertEqual(title, EXPECTED_TITLES[number], f"milestone {number} title drifted in {source}")

    def test_goal_demo_issues_agree_between_docs(self):
        """Each goal links the same demo issue in both docs."""
        rows = goal_rows(VISION)
        bullets = goal_bullets(BACKLOG)
        self.assertEqual({n: demo for n, (_title, demo) in rows.items()}, {n: demo for n, (_title, demo) in bullets.items()})
        for source, goals in (("docs/vision.md", rows), ("docs/backlog-restructure.md", bullets)):
            self.assertEqual({n: demo for n, (_title, demo) in goals.items()}, EXPECTED_DEMOS,
                             f"milestone to demo issue mapping drifted in {source}")

    def test_goal_docs_agree_on_titles(self):
        """The two docs carry identical titles per milestone number."""
        self.assertEqual({n: title for n, (title, _demo) in goal_rows(VISION).items()},
                         {n: title for n, (title, _demo) in goal_bullets(BACKLOG).items()})

    def test_open_issue_counts_reconcile(self):
        """after = before - closed during the restructure + new issues listed."""
        counts = counts_table(BACKLOG)
        before, after = counts["Open issues"]
        duplicates_closed = counts["Duplicates closed (as duplicate, cross-linked)"][1]
        stale_closed = counts["Stale/obsolete closed (not planned, with reason)"][1]
        new_issues_line = re.search(r"^\*\*New issues:\*\* (.+)$", BACKLOG, re.M).group(1)
        new_issues = re.findall(r"#(\d+)", new_issues_line)
        self.assertEqual(int(after), int(before) - int(duplicates_closed) - int(stale_closed) + len(new_issues),
                         "the Counts table does not reconcile with the listed closures and new issues")
        goal_milestone_after = counts["Open issues in a goal milestone"][1]
        self.assertLessEqual(int(goal_milestone_after), int(after), "goal-milestone issues exceed all open issues")


if __name__ == "__main__":
    unittest.main()
