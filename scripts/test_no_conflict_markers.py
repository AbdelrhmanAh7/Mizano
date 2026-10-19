"""Offline test ensuring tracked markdown files have no leftover git conflict markers.

Run: python3 -m unittest discover -s scripts -p 'test_no_conflict_markers.py'
"""

from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]


def find_conflict_markers(content: str) -> list[tuple[int, str]]:
    """Scan text for git conflict markers and prettier-escaped markers.

    Returns a list of (1-based line_number, line_text) for each detected marker.
    Distinguishes conflict separators from Markdown Setext heading underlines.
    """
    markers = []
    lines = content.splitlines()
    in_conflict = False

    for idx, line in enumerate(lines, start=1):
        lstripped = line.lstrip()
        prev = lines[idx - 2].strip() if idx > 1 else None

        # Git conflict start markers: <<<<<<< branch or < < < < < < <
        if lstripped.startswith("<<<<<<< ") or lstripped == "<<<<<<<" or lstripped.startswith("< < < < < < <"):
            markers.append((idx, line))
            in_conflict = True
        # Git conflict end markers: >>>>>>> branch or > > > > > > >
        elif lstripped.startswith(">>>>>>> ") or lstripped == ">>>>>>>" or lstripped.startswith("> > > > > > >"):
            markers.append((idx, line))
            in_conflict = False
        # Git diff3 conflict base markers: |||||||
        elif lstripped.startswith("||||||| ") or lstripped == "|||||||":
            markers.append((idx, line))
        # Git conflict middle marker: =======
        elif lstripped.startswith("======="):
            # A markdown Setext H1 underline is a sequence of '=' following a text line.
            # It cannot be a heading underline if:
            # - We are inside a conflict block (in_conflict is True)
            # - There is no previous line (start of document)
            # - The previous line is blank
            # - The previous line is a conflict marker or markdown block syntax (headers, rules, etc.)
            is_heading_underline = (
                not in_conflict
                and prev is not None
                and prev != ""
                and not prev.startswith(("#", "-", "*", ">", "`", "<", "|"))
                and not any(prev.startswith(m) for m in ("<<<<<<<", ">>>>>>>", "|||||||", "< < < < < < <", "> > > > > > >"))
            )
            if not is_heading_underline:
                markers.append((idx, line))

    return markers


def get_tracked_markdown_files() -> list[Path]:
    """Return all tracked markdown files in the repository."""
    try:
        out = subprocess.check_output(
            ["git", "ls-files"], cwd=ROOT, text=True, stderr=subprocess.DEVNULL
        )
        return [ROOT / f for f in out.splitlines() if f.endswith(".md")]
    except Exception:
        # Fallback if git is not available
        return [
            p
            for p in ROOT.rglob("*.md")
            if not any(part in ("node_modules", ".git", ".next", "dist") for part in p.parts)
        ]


class ConflictMarkerMatcherTests(unittest.TestCase):
    """Unit tests for the conflict marker matcher itself on inline strings."""

    def test_planted_raw_markers_fail(self):
        # Raw git conflict markers
        self.assertTrue(find_conflict_markers("<<<<<<< HEAD\n"))
        self.assertTrue(find_conflict_markers(">>>>>>> origin/master\n"))
        self.assertTrue(find_conflict_markers("||||||| base\n"))
        self.assertTrue(find_conflict_markers("=======\n"))
        self.assertTrue(find_conflict_markers("\n=======\n"))

    def test_planted_prettier_escaped_markers_fail(self):
        # Prettier reformats >>>>>>> to > > > > > > >
        self.assertTrue(find_conflict_markers("> > > > > > > origin/master\n"))
        self.assertTrue(find_conflict_markers("< < < < < < < HEAD\n"))

    def test_normal_heading_underline_passes(self):
        # Setext heading underlines must not be flagged
        self.assertEqual(find_conflict_markers("Heading\n=======\n"), [])
        self.assertEqual(find_conflict_markers("Document Title\n========================\n"), [])
        self.assertEqual(find_conflict_markers("# Section\n\nSubheading\n=======\n\nText"), [])

    def test_full_conflict_block_detected(self):
        content = (
            "Some introduction\n"
            "<<<<<<< HEAD\n"
            "feature work\n"
            "=======\n"
            "upstream master\n"
            ">>>>>>> origin/master\n"
            "More text\n"
        )
        markers = find_conflict_markers(content)
        self.assertEqual(len(markers), 3)
        self.assertEqual([idx for idx, _ in markers], [2, 4, 6])

    def test_prettier_escaped_leftover_marker_detected(self):
        # Specific regression scenario for #253: leftover marker after conflict resolution
        content = (
            "# Issue #127 Verification\n\n"
            "Some documentation\n\n"
            "> > > > > > > origin/master\n"
        )
        markers = find_conflict_markers(content)
        self.assertEqual(len(markers), 1)
        self.assertEqual(markers[0][0], 5)
        self.assertEqual(markers[0][1], "> > > > > > > origin/master")


class TrackedMarkdownConflictMarkerTests(unittest.TestCase):
    """Ensure no tracked markdown file in the repo contains merge conflict markers."""

    def test_no_conflict_markers_in_tracked_markdown(self):
        files = get_tracked_markdown_files()
        self.assertGreater(len(files), 0, "No markdown files found to check")

        violations = []
        for file_path in files:
            try:
                content = file_path.read_text(encoding="utf-8")
            except Exception as e:
                violations.append(f"{file_path.relative_to(ROOT)}: failed to read: {e}")
                continue

            markers = find_conflict_markers(content)
            for line_no, line_text in markers:
                rel = file_path.relative_to(ROOT)
                violations.append(f"{rel}:{line_no}: {line_text}")

        self.assertEqual(
            violations,
            [],
            f"Merge conflict markers found in tracked markdown files:\n" + "\n".join(violations),
        )


if __name__ == "__main__":
    unittest.main()
