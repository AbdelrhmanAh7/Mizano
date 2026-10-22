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

# Pattern matching imports or re-exports of another .e2e test file
E2E_IMPORT_PATTERN = re.compile(
    r"""^(?:import|export)\s+(?:.*?from\s+)?['"][^'"]*?\.e2e(?:\.ts)?['"]\s*;?""",
    re.MULTILINE,
)

# Pattern matching bare imports specifically: `import './something.e2e';`
BARE_E2E_IMPORT_PATTERN = re.compile(
    r"""^\s*import\s+['"][^'"]*?\.e2e(?:\.ts)?['"]\s*;?""",
    re.MULTILINE,
)


def find_e2e_import_violations(content: str) -> list[tuple[int, str]]:
    """Scan content for import/export of other .e2e test files.

    Returns a list of (line_number, line_text) for each detected violation.
    Skips single-line (//) and multi-line (/* ... */) comments.
    """
    violations = []
    in_block_comment = False

    for idx, line in enumerate(content.splitlines(), start=1):
        stripped = line.strip()
        if not stripped:
            continue

        if in_block_comment:
            if "*/" in stripped:
                in_block_comment = False
            continue

        if stripped.startswith("/*"):
            if "*/" not in stripped:
                in_block_comment = True
            continue

        if stripped.startswith("//"):
            continue

        if BARE_E2E_IMPORT_PATTERN.search(stripped) or E2E_IMPORT_PATTERN.search(stripped):
            violations.append((idx, line))

    return violations


def file_defines_test(content: str) -> bool:
    """Check if file defines at least one test case via test(...) or test.only(...).

    Excludes commented out lines to ensure actual active tests are present.
    """
    lines = []
    in_block_comment = False

    for line in content.splitlines():
        stripped = line.strip()
        if in_block_comment:
            if "*/" in stripped:
                in_block_comment = False
            continue
        if stripped.startswith("/*"):
            if "*/" not in stripped:
                in_block_comment = True
            continue
        if stripped.startswith("//"):
            continue
        lines.append(stripped)

    uncommented_text = "\n".join(lines)
    return bool(re.search(r"\btest(?:\.\w+)?\s*\(", uncommented_text))


class E2EArmyImportDetectorUnitTests(unittest.TestCase):
    """Unit tests for the e2e test import violation detector."""

    def test_bare_e2e_import_detected(self):
        code = "import './277-work-order-complete.e2e';"
        violations = find_e2e_import_violations(code)
        self.assertEqual(len(violations), 1)
        self.assertEqual(violations[0][0], 1)

    def test_bare_e2e_ts_import_detected(self):
        code = 'import "./277-work-order-complete.e2e.ts";'
        violations = find_e2e_import_violations(code)
        self.assertEqual(len(violations), 1)

    def test_reexport_e2e_detected(self):
        code = "export * from './277-work-order-complete.e2e';"
        violations = find_e2e_import_violations(code)
        self.assertEqual(len(violations), 1)

    def test_named_import_of_e2e_detected(self):
        code = "import { something } from './277-work-order-complete.e2e';"
        violations = find_e2e_import_violations(code)
        self.assertEqual(len(violations), 1)

    def test_standard_e2e_imports_not_flagged(self):
        code = """
import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { expect as expect2 } from "e2e";
"""
        violations = find_e2e_import_violations(code)
        self.assertEqual(violations, [])

    def test_comments_ignored(self):
        code = """
// import './277-work-order-complete.e2e';
/*
 * import './277-work-order-complete.e2e';
 */
"""
        violations = find_e2e_import_violations(code)
        self.assertEqual(violations, [])

    def test_file_defines_test_detector(self):
        valid = "test('@issue-326 AC1', async ({ app }) => {});"
        self.assertTrue(file_defines_test(valid))

        commented = "// test('@issue-326 AC1', async ({ app }) => {});"
        self.assertFalse(file_defines_test(commented))

        shim_only = "import './277-work-order-complete.e2e';"
        self.assertFalse(file_defines_test(shim_only))

    def test_planted_shim_regression_fails(self):
        """Re-creates the exact shim from PR #303 and verifies it is detected."""
        planted_shim = """/**
 * Issue #167 / #277: Work Order Complete E2E coverage.
 * The primary test suite is maintained in e2e-army/277-work-order-complete.e2e.ts.
 */
import './277-work-order-complete.e2e';
"""
        violations = find_e2e_import_violations(planted_shim)
        self.assertEqual(len(violations), 1)
        self.assertEqual(violations[0][0], 5)
        self.assertIn("import './277-work-order-complete.e2e'", violations[0][1])
        self.assertFalse(file_defines_test(planted_shim))


class E2EArmyRepositoryHygieneTests(unittest.TestCase):
    """Integration checks across actual files in e2e-army directory."""

    def test_no_167_duplicate_shim_file(self):
        """e2e-army/167-work-order-complete.e2e.ts must not exist as a duplicate re-import shim."""
        shim_path = E2E_ARMY_DIR / "167-work-order-complete.e2e.ts"
        if shim_path.exists():
            content = shim_path.read_text(encoding="utf-8")
            violations = find_e2e_import_violations(content)
            self.assertEqual(
                violations,
                [],
                f"167-work-order-complete.e2e.ts is a duplicate shim: {violations}",
            )
            self.assertTrue(
                file_defines_test(content),
                "167-work-order-complete.e2e.ts exists but defines no tests",
            )

    def test_no_bare_e2e_imports_in_e2e_army(self):
        """No .e2e.ts file in e2e-army may import another .e2e file."""
        if not E2E_ARMY_DIR.exists():
            return

        all_e2e_files = sorted(E2E_ARMY_DIR.glob("*.e2e.ts"))
        self.assertGreater(len(all_e2e_files), 0, "No e2e-army test files found")

        for file_path in all_e2e_files:
            content = file_path.read_text(encoding="utf-8")
            violations = find_e2e_import_violations(content)
            self.assertEqual(
                violations,
                [],
                f"File {file_path.name} contains invalid .e2e imports: {violations}",
            )

    def test_all_e2e_files_define_tests(self):
        """Every file in e2e-army must define active test cases rather than acting as a passthrough shim."""
        if not E2E_ARMY_DIR.exists():
            return

        all_e2e_files = sorted(E2E_ARMY_DIR.glob("*.e2e.ts"))
        for file_path in all_e2e_files:
            content = file_path.read_text(encoding="utf-8")
            self.assertTrue(
                file_defines_test(content),
                f"File {file_path.name} does not define any active test cases",
            )

    def test_379_e2e_no_hardcoded_credentials(self):
        """e2e-army/379-bill-rtl-content.e2e.ts must exist and not contain hardcoded credentials or string-splitting fallbacks."""
        test_file = E2E_ARMY_DIR / "379-bill-rtl-content.e2e.ts"
        self.assertTrue(test_file.exists(), "379-bill-rtl-content.e2e.ts must exist")
        content = test_file.read_text(encoding="utf-8")
        self.assertNotIn("password123", content, "379 spec contains hardcoded plaintext password123")
        self.assertNotIn("admin@mizano.com", content, "379 spec contains hardcoded email")
        self.assertIn("process.env", content, "379 spec should source credentials dynamically from env")
        self.assertNotRegex(
            content,
            r"""['"]password123['"]|(?:\.join\(|\.concat\()""",
            "379 spec evades credential scanner with string splitting",
        )


if __name__ == "__main__":
    unittest.main()
