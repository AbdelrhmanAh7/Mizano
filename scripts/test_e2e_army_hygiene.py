"""Hygiene and regression tests for e2e-army test suites.

Guards against duplicate test registration caused by bare imports or shims of
other e2e test files (as identified in PR #303 finding 4c59d0fbb73a / issue #326),
and prevents hardcoded sensitive credentials and plaintext passwords in e2e
test files (as identified in PR #340 finding 7921754e38c2 / issue #378).

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

# Pattern matching hardcoded credentials / plaintext password123 or admin@mizano.com in e2e test files.
# Handles quotes (' or ") as well as backtick template literals (`), and flags pw/password keys
# assigned to string or template literals in login/admin credential definitions without process.env.
HARDCODED_LITERAL_CREDENTIAL_PATTERN = re.compile(
    r"""(?:\b(?:pw|password)\s*:\s*[`'"]password123[`'"]|[`'"]password123[`'"]|\bemail\s*:\s*[`'"]admin@mizano\.com[`'"])""",
    re.IGNORECASE,
)

# Pattern matching obfuscated joined credential strings (e.g. ['admin', 'mizano.com'].join(...) or ['password', '123'].join(...))
OBFUSCATED_JOIN_CREDENTIAL_PATTERN = re.compile(
    r"""\[[^\]]*?['"`](?:password|admin|mizano\.com)[^\]]*?\]\s*\.\s*join""",
    re.IGNORECASE,
)

# Pattern matching fallback expressions providing hardcoded default credentials or passwords when sourcing from process.env
ENV_CREDENTIAL_FALLBACK_PATTERN = re.compile(
    r"""(?:\b(?:pw|password|email|admin|login|auth|credentials)\b.*?process\.env\.[A-Z0-9_]+|process\.env\.(?:E2E_)?(?:LOGIN_|USER_)?(?:PASSWORD|PW|EMAIL|SECRET))\s*(?:\?\?|\|\|)\s*(?:[`'"][^`'"]+[`'"]|\[[^\]]+\]\s*\.\s*join)""",
    re.IGNORECASE,
)

LOGIN_CREDENTIAL_OBJECT_PATTERN = re.compile(
    r"""(?:\b(?:LOGIN|ADMIN|CREDENTIALS)\b|params\s*:|/auth/login)""",
    re.IGNORECASE,
)

PW_KEY_ASSIGNMENT_PATTERN = re.compile(
    r"""\b(?:pw|password)\s*:\s*[`'"][^`'"]+[`'"]""",
    re.IGNORECASE,
)


def find_hardcoded_credential_violations(content: str) -> list[tuple[int, str]]:
    """Scan content for hard-coded credentials, plaintext passwords, or default fallbacks.

    Guards against:
    - Sensitive plaintext password/email literals ('password123', 'admin@mizano.com')
      in single quotes, double quotes, or backtick template literals.
    - Obfuscated joined credential strings (e.g. ['password', '123'].join('')).
    - Default fallback credentials in environment variable lookups (e.g. process.env.E2E_LOGIN_PASSWORD ?? '...').
    - Password keys (`pw:` or `password:`) assigned to string or template literals
      without dynamic sourcing via `process.env`.

    Scoped to guard against hardcoded login credentials and sensitive plaintext
    passwords in e2e test files (as identified in PR #340 finding 7921754e38c2 / issue #378).

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

        code_part = stripped.split("//")[0].strip()
        if not code_part:
            continue

        # 1. Direct match for known sensitive plaintext credentials in any quote or backtick style
        if HARDCODED_LITERAL_CREDENTIAL_PATTERN.search(code_part):
            violations.append((idx, line))
            continue

        # 2. Match obfuscated joined credential strings (e.g. ['admin', 'mizano.com'].join)
        if OBFUSCATED_JOIN_CREDENTIAL_PATTERN.search(code_part):
            violations.append((idx, line))
            continue

        # 3. Match default fallback credentials provided to process.env credential lookups
        if ENV_CREDENTIAL_FALLBACK_PATTERN.search(code_part):
            violations.append((idx, line))
            continue

        # 4. Generalised check: flag pw/password keys assigned to a non-process.env string or template literal.
        # Check each pw/password assignment individually to avoid missing hardcoded values mixed with process.env on the same line.
        for pw_match in PW_KEY_ASSIGNMENT_PATTERN.finditer(code_part):
            assignment = pw_match.group(0)
            # If this specific assignment uses process.env, it's compliant
            if "process.env" in assignment:
                continue
            # Otherwise, if we're in a LOGIN/ADMIN/CREDENTIALS context or login-related code, flag it
            if LOGIN_CREDENTIAL_OBJECT_PATTERN.search(code_part) or re.search(r"""\b(?:LOGIN|ADMIN)\b""", content):
                violations.append((idx, line))
                break  # One violation per line is enough

    return violations


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

    def test_hardcoded_credentials_in_317_snippet_detected(self):
        """Snippet from PR #340 finding 7921754e38c2 is detected as a violation."""
        code = "const LOGIN = { email: 'admin@mizano.com', pw: 'password123' };"
        violations = find_hardcoded_credential_violations(code)
        self.assertEqual(len(violations), 1)
        self.assertEqual(violations[0][0], 1)
        self.assertIn("password123", violations[0][1])
        self.assertIn("admin@mizano.com", violations[0][1])

    def test_hardcoded_credentials_template_literal_detected(self):
        """Backtick template literals containing password123 or admin@mizano.com are detected."""
        code = "const LOGIN = { email: `admin@mizano.com`, pw: `password123` };"
        violations = find_hardcoded_credential_violations(code)
        self.assertEqual(len(violations), 1)
        self.assertEqual(violations[0][0], 1)
        self.assertIn("password123", violations[0][1])

    def test_arbitrary_hardcoded_password_literal_detected(self):
        """Arbitrary passwords assigned to pw/password in LOGIN or ADMIN objects are detected."""
        code_login = "const LOGIN = { email: 'custom@mizano.com', pw: 'customSecret99!' };"
        violations_login = find_hardcoded_credential_violations(code_login)
        self.assertEqual(len(violations_login), 1)
        self.assertIn("customSecret99!", violations_login[0][1])

        code_admin = 'const ADMIN = { email: "custom@mizano.com", password: "customSecret88!" };'
        violations_admin = find_hardcoded_credential_violations(code_admin)
        self.assertEqual(len(violations_admin), 1)
        self.assertIn("customSecret88!", violations_admin[0][1])

        code_template = "const LOGIN = { email: 'custom@mizano.com', pw: `customSecret77!` };"
        violations_template = find_hardcoded_credential_violations(code_template)
        self.assertEqual(len(violations_template), 1)
        self.assertIn("customSecret77!", violations_template[0][1])

    def test_hardcoded_email_detected(self):
        """Hardcoded admin@mizano.com email in login credentials is detected as a violation."""
        code = "const LOGIN = { email: 'admin@mizano.com' };"
        violations = find_hardcoded_credential_violations(code)
        self.assertEqual(len(violations), 1)
        self.assertEqual(violations[0][0], 1)
        self.assertIn("admin@mizano.com", violations[0][1])

    def test_sanitized_credentials_accepted(self):
        """Dynamic credentials from environment are accepted without violations."""
        code = """
const LOGIN = {
  email: process.env.E2E_USER_EMAIL || process.env.E2E_LOGIN_EMAIL,
  pw: process.env.E2E_USER_PASSWORD || process.env.E2E_LOGIN_PASSWORD,
};
"""
        violations = find_hardcoded_credential_violations(code)
        self.assertEqual(violations, [])

    def test_env_fallback_with_obfuscated_join_detected(self):
        """Default fallback credentials using obfuscated join in process.env lookups are detected."""
        code_email = "const loginEmail = process.env.E2E_LOGIN_EMAIL ?? ['admin', 'mizano.com'].join('@');"
        violations_email = find_hardcoded_credential_violations(code_email)
        self.assertEqual(len(violations_email), 1)
        self.assertEqual(violations_email[0][0], 1)
        self.assertIn("mizano.com", violations_email[0][1])

        code_password = "const loginPassword = process.env.E2E_LOGIN_PASSWORD ?? ['password', '123'].join('');"
        violations_password = find_hardcoded_credential_violations(code_password)
        self.assertEqual(len(violations_password), 1)
        self.assertEqual(violations_password[0][0], 1)
        self.assertIn("password", violations_password[0][1])

    def test_env_fallback_with_hardcoded_password_detected(self):
        """Default fallback with literal password123 in process.env fallback is detected."""
        code = "const loginPassword = process.env.E2E_LOGIN_PASSWORD ?? 'password123';"
        violations = find_hardcoded_credential_violations(code)
        self.assertEqual(len(violations), 1)
        self.assertEqual(violations[0][0], 1)
        self.assertIn("password123", violations[0][1])

    def test_env_fallback_with_arbitrary_string_password_detected(self):
        """Default fallback with arbitrary non-empty string in credential/password lookup is detected."""
        code = "const pw = process.env.E2E_LOGIN_PASSWORD ?? 'arbitraryFallbackSecret!';"
        violations = find_hardcoded_credential_violations(code)
        self.assertEqual(len(violations), 1)
        self.assertEqual(violations[0][0], 1)
        self.assertIn("arbitraryFallbackSecret!", violations[0][1])

        code_or = "const pw = process.env.PASSWORD || 'arbitraryFallbackSecret2!';"
        violations_or = find_hardcoded_credential_violations(code_or)
        self.assertEqual(len(violations_or), 1)
        self.assertEqual(violations_or[0][0], 1)
        self.assertIn("arbitraryFallbackSecret2!", violations_or[0][1])

    def test_planted_317_hardcoded_credentials_regression_fails(self):
        """Re-creates the exact hardcoded credentials from PR #340 and verifies it is detected."""
        planted_code = """import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const SEED = 'army-317';
const LOGIN = { email: 'admin@mizano.com', pw: 'password123' };

test('@issue-317 AC1', { tags: ['feat:mz-purchase-bills', 'lvl:ui'] }, async ({ app }) => {});
"""
        violations = find_hardcoded_credential_violations(planted_code)
        self.assertEqual(len(violations), 1)
        self.assertEqual(violations[0][0], 5)
        self.assertIn("password123", violations[0][1])

    def test_mixed_process_env_and_hardcoded_on_same_line_detected(self):
        """Hardcoded pw/password on same line as process.env assignments are detected."""
        # Simulates: const LOGIN = { email: process.env.EMAIL, pw: 'hardcoded' };
        code = "const LOGIN = { email: process.env.E2E_LOGIN_EMAIL, pw: 'hardcodedSecret!' };"
        violations = find_hardcoded_credential_violations(code)
        self.assertEqual(len(violations), 1)
        self.assertEqual(violations[0][0], 1)
        self.assertIn("hardcodedSecret!", violations[0][1])

        # Also test with password key
        code2 = 'const ADMIN = { email: process.env.E2E_LOGIN_EMAIL, password: "hardcodedPass!" };'
        violations2 = find_hardcoded_credential_violations(code2)
        self.assertEqual(len(violations2), 1)
        self.assertEqual(violations2[0][0], 1)
        self.assertIn("hardcodedPass!", violations2[0][1])

        # Template literal version
        code3 = "const LOGIN = { email: process.env.E2E_LOGIN_EMAIL, pw: `hardcodedTemplate!` };"
        violations3 = find_hardcoded_credential_violations(code3)
        self.assertEqual(len(violations3), 1)
        self.assertEqual(violations3[0][0], 1)
        self.assertIn("hardcodedTemplate!", violations3[0][1])

    def test_process_env_assignments_not_flagged(self):
        """Assignments using process.env for pw/password are not flagged even on same line."""
        code = "const LOGIN = { email: process.env.E2E_LOGIN_EMAIL, pw: process.env.E2E_LOGIN_PASSWORD };"
        violations = find_hardcoded_credential_violations(code)
        self.assertEqual(violations, [])

        code2 = 'const ADMIN = { email: process.env.EMAIL, password: process.env.PASSWORD };'
        violations2 = find_hardcoded_credential_violations(code2)
        self.assertEqual(violations2, [])


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

    def test_no_hardcoded_credentials_in_e2e_army(self):
        """No .e2e.ts file in e2e-army may contain hardcoded credentials or plaintext passwords."""
        if not E2E_ARMY_DIR.exists():
            return

        all_e2e_files = sorted(E2E_ARMY_DIR.glob("*.e2e.ts"))
        self.assertGreater(len(all_e2e_files), 0, "No e2e-army test files found")

        for file_path in all_e2e_files:
            content = file_path.read_text(encoding="utf-8")
            violations = find_hardcoded_credential_violations(content)
            self.assertEqual(
                violations,
                [],
                f"File {file_path.name} contains hardcoded credential violations: {violations}",
            )

    def test_no_hardcoded_credential_fallbacks_in_e2e_army(self):
        """No .e2e.ts file in e2e-army may use default fallback credentials or obfuscated joins."""
        if not E2E_ARMY_DIR.exists():
            return

        all_e2e_files = sorted(E2E_ARMY_DIR.glob("*.e2e.ts"))
        for file_path in all_e2e_files:
            content = file_path.read_text(encoding="utf-8")
            for idx, line in enumerate(content.splitlines(), start=1):
                clean_line = line.split("//")[0].strip()
                self.assertFalse(
                    bool(OBFUSCATED_JOIN_CREDENTIAL_PATTERN.search(clean_line)),
                    f"File {file_path.name}:{idx} uses obfuscated credential join fallback: {line}",
                )
                self.assertFalse(
                    bool(ENV_CREDENTIAL_FALLBACK_PATTERN.search(clean_line)),
                    f"File {file_path.name}:{idx} uses default fallback credentials in env lookup: {line}",
                )

    def test_e2e_login_specs_source_credentials_from_env(self):
        """Specs in e2e-army that perform login must source credentials dynamically from environment."""
        if not E2E_ARMY_DIR.exists():
            return

        all_e2e_files = sorted(E2E_ARMY_DIR.glob("*.e2e.ts"))
        login_specs_checked = 0
        for file_path in all_e2e_files:
            content = file_path.read_text(encoding="utf-8")
            if "/login" in content or "sign in as" in content:
                login_specs_checked += 1
                # Check if the file directly uses process.env or imports a helper that does
                uses_env_directly = "process.env" in content
                uses_helper = "loadTestCredentials" in content or "loadTestCredentialsLegacy" in content

                # If using helper, verify the helper sources from process.env
                if uses_helper and not uses_env_directly:
                    helper_file = E2E_ARMY_DIR / "utils" / "test-credentials.ts"
                    if helper_file.exists():
                        helper_content = helper_file.read_text(encoding="utf-8")
                        self.assertIn(
                            "process.env",
                            helper_content,
                            f"Helper {helper_file.name} must source credentials from process.env",
                        )
                    else:
                        self.fail(f"File {file_path.name} imports credential helper but helper not found")
                elif not uses_env_directly:
                    self.fail(
                        f"File {file_path.name} performs login but does not source credentials from process.env "
                        "(directly or via helper)"
                    )
        self.assertGreater(login_specs_checked, 0, "Expected at least one spec in e2e-army that logs in")

    def test_317_e2e_no_hardcoded_credentials(self):
        """e2e-army/317-searchable-bill-options.e2e.ts must not contain hard-coded credentials."""
        test_file = E2E_ARMY_DIR / "317-searchable-bill-options.e2e.ts"
        self.assertTrue(test_file.exists(), "317-searchable-bill-options.e2e.ts must exist")
        content = test_file.read_text(encoding="utf-8")
        violations = find_hardcoded_credential_violations(content)
        self.assertEqual(
            violations,
            [],
            f"317 spec contains hardcoded credentials: {violations}",
        )
        self.assertNotIn("password123", content, "317 spec contains hardcoded plaintext password123")
        self.assertNotIn("admin@mizano.com", content, "317 spec contains hardcoded plaintext admin@mizano.com")

        # Verify credentials are sourced from process.env (directly or via helper)
        uses_env_directly = "process.env" in content
        uses_helper = "loadTestCredentials" in content or "loadTestCredentialsLegacy" in content
        if uses_helper and not uses_env_directly:
            helper_file = E2E_ARMY_DIR / "utils" / "test-credentials.ts"
            self.assertTrue(helper_file.exists(), "Credential helper must exist")
            helper_content = helper_file.read_text(encoding="utf-8")
            self.assertIn("process.env", helper_content, "Helper must source credentials from process.env")
        elif not uses_env_directly:
            self.fail("317 spec should source credentials dynamically from env (directly or via helper)")

    def test_credential_helper_sources_from_env_without_fallbacks(self):
        """e2e-army/utils/test-credentials.ts must exist and source credentials from process.env with zero hardcoded fallbacks."""
        helper_file = E2E_ARMY_DIR / "utils" / "test-credentials.ts"
        self.assertTrue(helper_file.exists(), "Credential helper e2e-army/utils/test-credentials.ts must exist")
        content = helper_file.read_text(encoding="utf-8")
        violations = find_hardcoded_credential_violations(content)
        self.assertEqual(violations, [], f"Credential helper contains hardcoded credential violations: {violations}")
        self.assertIn("process.env", content, "Helper must source credentials from process.env")
        self.assertIn("loadTestCredentials", content, "Helper must export loadTestCredentials")
        self.assertIn("loadTestCredentialsLegacy", content, "Helper must export loadTestCredentialsLegacy")
        self.assertNotIn("password123", content, "Helper must not contain hardcoded plaintext password123")
        self.assertNotIn("admin@mizano.com", content, "Helper must not contain hardcoded plaintext admin@mizano.com")

    def test_credential_helper_runtime_behavior(self):
        """Verify loadTestCredentials() and loadTestCredentialsLegacy() runtime contracts using node."""
        import subprocess

        helper_file = E2E_ARMY_DIR / "utils" / "test-credentials.ts"
        self.assertTrue(helper_file.exists(), "Helper file must exist")
        node_script = """
const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const helperPath = path.resolve('e2e-army/utils/test-credentials.ts');
const code = fs.readFileSync(helperPath, 'utf-8');
const result = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const mod = {};
const fn = new Function('exports', 'process', 'require', result.outputText);

// 1. Throws descriptive error when required env vars are missing
let threw = false;
try {
  fn(mod, { env: {}, cwd: () => '/nonexistent' }, require);
  mod.loadTestCredentials();
} catch (e) {
  threw = true;
  if (!e.message.includes('Missing required environment variables for e2e tests')) {
    throw new Error('Unexpected error message: ' + e.message);
  }
}
if (!threw) throw new Error('Expected loadTestCredentials to throw when env vars are missing');

// 2. Loads credentials from E2E_LOGIN_EMAIL and E2E_LOGIN_PASSWORD
fn(mod, { env: { E2E_LOGIN_EMAIL: 'admin@ci.local', E2E_LOGIN_PASSWORD: 'ci-secret-password' }, cwd: () => '/nonexistent' }, require);
const creds1 = mod.loadTestCredentials();
if (creds1.email !== 'admin@ci.local' || creds1.password !== 'ci-secret-password') {
  throw new Error('Failed to load E2E_LOGIN_* credentials');
}
const legacy1 = mod.loadTestCredentialsLegacy();
if (legacy1.email !== 'admin@ci.local' || legacy1.pw !== 'ci-secret-password') {
  throw new Error('Failed to load legacy credentials');
}

// 3. Supports TEST_USER_EMAIL and TEST_USER_PASSWORD
fn(mod, { env: { TEST_USER_EMAIL: 'user@ci.local', TEST_USER_PASSWORD: 'user-secret-password' }, cwd: () => '/nonexistent' }, require);
const creds2 = mod.loadTestCredentials();
if (creds2.email !== 'user@ci.local' || creds2.password !== 'user-secret-password') {
  throw new Error('Failed to load TEST_USER_* credentials');
}

process.stdout.write('OK');
"""
        res = subprocess.run(["node", "-e", node_script], capture_output=True, text=True)
        self.assertEqual(res.returncode, 0, f"Credential helper runtime validation failed: {res.stderr}")
        self.assertIn("OK", res.stdout)



if __name__ == "__main__":
    unittest.main()
