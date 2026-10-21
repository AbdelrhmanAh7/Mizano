"""Hygiene and regression tests for e2e-army test suites.

Guards against duplicate test registration caused by bare imports or shims of
other e2e test files (as identified in PR #303 finding 4c59d0fbb73a / issue #326).

Run: python3 -m unittest discover -s scripts -p 'test_e2e_army_hygiene.py'
"""

from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
E2E_ARMY_DIR = ROOT / "e2e-army"

E2E_IMPORT_PATTERN = re.compile(
    r"""^(?:import|export)\s+(?:.*?from\s+)?['"][^'"]*?\.e2e(?:\.ts)?['"]\s*;?""",
    re.MULTILINE,
)


def strip_comments(text: str) -> str:
    """Strip single-line and multi-line comments from source text."""
    no_block = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
    return re.sub(r"//.*$", "", no_block, flags=re.MULTILINE)


def find_e2e_import_violations(content: str) -> list[tuple[int, str]]:
    """Scan content for import/export of other .e2e test files outside comments."""
    violations = []
    in_block = False
    for idx, line in enumerate(content.splitlines(), start=1):
        stripped = line.strip()
        if in_block:
            if "*/" in stripped:
                in_block = False
            continue
        if stripped.startswith("/*"):
            if "*/" not in stripped:
                in_block = True
            continue
        if stripped.startswith("//") or not stripped:
            continue
        if E2E_IMPORT_PATTERN.search(stripped):
            violations.append((idx, line))
    return violations


def file_defines_test(content: str) -> bool:
    """Check if file defines active test cases via test(...) outside comments."""
    return bool(re.search(r"\btest(?:\.\w+)?\s*\(", strip_comments(content)))


class E2EArmyImportDetectorUnitTests(unittest.TestCase):
    """Unit tests for the e2e test import violation detector."""

    def test_bare_e2e_import_detected(self):
        code = "import './277-work-order-complete.e2e';"
        self.assertEqual(len(find_e2e_import_violations(code)), 1)

    def test_bare_e2e_ts_import_detected(self):
        code = 'import "./277-work-order-complete.e2e.ts";'
        self.assertEqual(len(find_e2e_import_violations(code)), 1)

    def test_reexport_e2e_detected(self):
        code = "export * from './277-work-order-complete.e2e';"
        self.assertEqual(len(find_e2e_import_violations(code)), 1)

    def test_named_import_of_e2e_detected(self):
        code = "import { something } from './277-work-order-complete.e2e';"
        self.assertEqual(len(find_e2e_import_violations(code)), 1)

    def test_standard_e2e_imports_not_flagged(self):
        code = "import { test } from '@e2e-dev/web';\nimport { expect } from 'e2e';"
        self.assertEqual(find_e2e_import_violations(code), [])

    def test_comments_ignored(self):
        code = "// import './277-work-order-complete.e2e';\n/* import './277.e2e'; */"
        self.assertEqual(find_e2e_import_violations(code), [])

    def test_file_defines_test_detector(self):
        self.assertTrue(file_defines_test("test('@issue-326 AC1', async () => {});"))
        self.assertFalse(file_defines_test("// test('@issue-326 AC1', async () => {});"))
        self.assertFalse(file_defines_test("import './277-work-order-complete.e2e';"))

    def test_planted_shim_regression_fails(self):
        """Re-creates the exact shim from PR #303 and verifies it is detected."""
        planted = "/**\n * Shim\n */\nimport './277-work-order-complete.e2e';\n"
        violations = find_e2e_import_violations(planted)
        self.assertEqual(len(violations), 1)
        self.assertEqual(violations[0][0], 4)
        self.assertFalse(file_defines_test(planted))


class E2EArmyRepositoryHygieneTests(unittest.TestCase):
    """Integration checks across actual files in e2e-army directory."""

    def test_no_167_duplicate_shim_file(self):
        """e2e-army/167-work-order-complete.e2e.ts must not exist as a duplicate re-import shim."""
        shim_path = E2E_ARMY_DIR / "167-work-order-complete.e2e.ts"
        if shim_path.exists():
            content = shim_path.read_text(encoding="utf-8")
            self.assertEqual(find_e2e_import_violations(content), [])
            self.assertTrue(file_defines_test(content))

    def test_no_bare_e2e_imports_in_e2e_army(self):
        """No .e2e.ts file in e2e-army may import another .e2e file."""
        if not E2E_ARMY_DIR.exists():
            return
        for file_path in sorted(E2E_ARMY_DIR.glob("*.e2e.ts")):
            content = file_path.read_text(encoding="utf-8")
            self.assertEqual(find_e2e_import_violations(content), [], f"In {file_path.name}")

    def test_all_e2e_files_define_tests(self):
        """Every file in e2e-army must define active test cases rather than acting as a passthrough shim."""
        if not E2E_ARMY_DIR.exists():
            return
        for file_path in sorted(E2E_ARMY_DIR.glob("*.e2e.ts")):
            content = file_path.read_text(encoding="utf-8")
            self.assertTrue(file_defines_test(content), f"In {file_path.name}")


if __name__ == "__main__":
    unittest.main()
