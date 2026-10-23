#!/usr/bin/env python3
"""
scripts/test_root_files_hygiene.py

Hygiene guard verifying that repository root process/scratchpad files (such as AI_QUESTIONS.md)
are excluded from git tracking, ignored via .gitignore, and rejected on git add.

Resolves review findings from PR #312 / issue #323:
- Untrack/remove AI_QUESTIONS.md from repository root index
- Ignore /AI_QUESTIONS.md in .gitignore
- Guard that ephemeral local scratchpads do not dirty git status
- Assert check-ignore and ls-files rather than forbidding local existence
"""

import subprocess
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
AI_QUESTIONS_FILE = REPO_ROOT / "AI_QUESTIONS.md"
GITIGNORE_FILE = REPO_ROOT / ".gitignore"


class RootFilesHygieneTests(unittest.TestCase):
    def test_ai_questions_not_tracked_in_git_index(self):
        """AI_QUESTIONS.md must not be tracked in the git index."""
        result = subprocess.run(
            ["git", "ls-files", "AI_QUESTIONS.md"],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            check=True,
        )
        self.assertEqual(
            result.stdout.strip(),
            "",
            "AI_QUESTIONS.md must not be tracked in git index",
        )

    def test_gitignore_contains_ai_questions_rule(self):
        """.gitignore must contain /AI_QUESTIONS.md rule."""
        content = GITIGNORE_FILE.read_text(encoding="utf-8")
        rules = [line.strip() for line in content.splitlines()]
        has_rule = any(
            rule in ("/AI_QUESTIONS.md", "AI_QUESTIONS.md") for rule in rules
        )
        self.assertTrue(
            has_rule, ".gitignore must contain '/AI_QUESTIONS.md' pattern"
        )

    def test_git_check_ignore_matches_ai_questions(self):
        """git check-ignore AI_QUESTIONS.md must resolve to AI_QUESTIONS.md with exit code 0."""
        result = subprocess.run(
            ["git", "check-ignore", "AI_QUESTIONS.md"],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout.strip(), "AI_QUESTIONS.md")

    def test_local_ai_questions_file_ignored_by_git_status(self):
        """Local AI_QUESTIONS.md scratch file must be ignored and leave git status clean."""
        existed_before = AI_QUESTIONS_FILE.exists()
        try:
            if not existed_before:
                AI_QUESTIONS_FILE.write_text("# Scratchpad questions\n", encoding="utf-8")

            status_result = subprocess.run(
                ["git", "status", "--porcelain", "AI_QUESTIONS.md"],
                cwd=str(REPO_ROOT),
                capture_output=True,
                text=True,
                check=True,
            )
            self.assertEqual(
                status_result.stdout.strip(),
                "",
                "Local AI_QUESTIONS.md must not appear in git status --porcelain",
            )
        finally:
            if not existed_before and AI_QUESTIONS_FILE.exists():
                AI_QUESTIONS_FILE.unlink()

    def test_git_add_ai_questions_rejected(self):
        """git add AI_QUESTIONS.md must fail because the file is ignored by .gitignore."""
        existed_before = AI_QUESTIONS_FILE.exists()
        try:
            if not existed_before:
                AI_QUESTIONS_FILE.write_text("# Scratchpad questions\n", encoding="utf-8")

            add_result = subprocess.run(
                ["git", "add", "AI_QUESTIONS.md"],
                cwd=str(REPO_ROOT),
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(
                add_result.returncode,
                0,
                "git add on ignored AI_QUESTIONS.md must return non-zero exit code",
            )
            self.assertIn("The following paths are ignored", add_result.stderr)
        finally:
            if not existed_before and AI_QUESTIONS_FILE.exists():
                AI_QUESTIONS_FILE.unlink()


if __name__ == "__main__":
    unittest.main()
