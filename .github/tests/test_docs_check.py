"""Run the exact CI Bash guard with fake event payloads and bounded git fixtures."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]


def guard_script():
    workflow = (ROOT / '.github/workflows/ci.yml').read_text(encoding='utf-8')
    job = workflow.split('  docs-check:\n', 1)[1].split('\n  #', 1)[0]
    block = job.split('        run: |\n', 1)[1]
    return '\n'.join(line[10:] for line in block.splitlines() if line.startswith('          ')) + '\n'


class DocsCheckTests(unittest.TestCase):
    def run_guard(self, scoped=(), markdown=(), body=None, git_failure=False,
                  docs_git_failure=False, unset_body=False):
        bash = shutil.which('bash')
        self.assertIsNotNone(bash, 'Install bash (Git Bash on Windows) to run these tests')
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            folder = Path(directory)
            fixture = folder / 'fixture'
            fixture.mkdir()
            # No repository mutations or commits. Assert exact git arguments and SHA mapping.
            (fixture / 'git').write_text(
                '#!/usr/bin/env bash\nset -euo pipefail\n'
                '[[ "$1" == diff && "$2" == --name-only && "$3" == --no-renames ]]\n'
                'if [[ "${4}" == --diff-filter=ACMRT ]]; then\n'
                '  [[ "$5" == -z && "$6" == "$BASE_SHA" && "$7" == "$HEAD_SHA" '
                '&& "$8" == -- && "$9" == "*.md" && "$#" == 9 ]]\n'
                '  [[ "$DOCS_GIT_FAILURE" == 0 ]] || exit 128\n'
                '  cat "$FIXTURE_DIR/markdown"\n'
                'else\n'
                '  [[ "$4" == -z && "$5" == "$BASE_SHA" && "$6" == "$HEAD_SHA" '
                '&& "$7" == -- && "$8" == apps/ && "$9" == packages/ '
                '&& "${10}" == deploy/ && "${11}" == .github/ && "$#" == 11 ]]\n'
                '  [[ "$GIT_FAILURE" == 0 ]] || exit 128\n'
                '  cat "$FIXTURE_DIR/scoped"\n'
                'fi\n', encoding='utf-8', newline='\n',
            )
            (fixture / 'git').chmod(0o755)
            for name, paths in [('scoped', scoped), ('markdown', markdown)]:
                (fixture / name).write_bytes(b''.join(path.encode('utf-8') + b'\0' for path in paths))
            event = {'pull_request': {'body': body, 'base': {'sha': 'a' * 40}, 'head': {'sha': 'b' * 40}}}
            payload = folder / 'event.json'
            payload.write_text(json.dumps(event), encoding='utf-8')
            pr = json.loads(payload.read_text(encoding='utf-8'))['pull_request']
            env = os.environ.copy()
            env.update(BASE_SHA=pr['base']['sha'], HEAD_SHA=pr['head']['sha'],
                       FIXTURE_DIR=fixture.as_posix(), GIT_FAILURE=str(int(git_failure)),
                       DOCS_GIT_FAILURE=str(int(docs_git_failure)))
            if unset_body:
                env.pop('PR_BODY', None)
            else:
                env['PR_BODY'] = pr['body'] or ''
            # Let bash build PATH so Windows drive-letter colons cannot split it incorrectly.
            script = (
                'if command -v cygpath >/dev/null 2>&1; then\n'
                '  FIXTURE_DIR="$(cygpath -u "$FIXTURE_DIR")"\n'
                '  export FIXTURE_DIR\n'
                'fi\n'
                'export PATH="$FIXTURE_DIR:$PATH"\n' + guard_script()
            )
            result = subprocess.run([bash, '--noprofile', '--norc', '-c', script],
                                    cwd=folder, env=env, capture_output=True, text=True, timeout=15)
            self.assertFalse((folder / 'INJECTED').exists(), 'PR body was executed')
            return result.returncode

    def test_each_gated_directory_requires_docs(self):
        for path in ['apps/api/src/example.ts', 'packages/validators/src/example.ts',
                     'deploy/pi/example.sh', '.github/workflows/example.yml']:
            with self.subTest(path=path):
                self.assertEqual(self.run_guard(scoped=[path]), 1)

    def test_non_gated_change_passes(self):
        self.assertEqual(self.run_guard(), 0)

    def test_markdown_update_anywhere_passes(self):
        self.assertEqual(self.run_guard(scoped=['apps/api/example.ts'], markdown=['docs/guide.md']), 0)

    def test_nested_readme_passes(self):
        self.assertEqual(self.run_guard(scoped=['deploy/pi/README.md'], markdown=['deploy/pi/README.md']), 0)

    def test_valid_exemption_line_passes(self):
        self.assertEqual(self.run_guard(scoped=['apps/web/example.ts'],
                                       body='Summary\nDocs: not needed because behavior is unchanged.\n'), 0)

    def test_crlf_exemption_passes(self):
        self.assertEqual(self.run_guard(scoped=['.github/ci.yml'],
                                       body='Summary\r\nDocs: not needed because CI-only correction.\r\n'), 0)

    def test_midline_or_quoted_exemption_fails(self):
        for body in ['- Docs: not needed because reason', '> Docs: not needed because reason',
                     'prefix Docs: not needed because reason', ' docs: not needed because reason']:
            with self.subTest(body=body):
                self.assertEqual(self.run_guard(scoped=['apps/api/example.ts'], body=body), 1)

    def test_null_and_missing_body_fail(self):
        self.assertEqual(self.run_guard(scoped=['apps/api/example.ts']), 1)
        self.assertEqual(self.run_guard(scoped=['apps/api/example.ts'], unset_body=True), 1)

    def test_body_metacharacters_are_data(self):
        for body, expected in [('$(touch INJECTED)\n`touch INJECTED`', 1),
                               ('Docs: not needed because $(touch INJECTED); `touch INJECTED`', 0)]:
            with self.subTest(expected=expected):
                self.assertEqual(self.run_guard(scoped=['apps/api/example.ts'], body=body), expected)

    def test_deleted_markdown_alone_does_not_pass(self):
        # --diff-filter=ACMRT excludes deleted Markdown from the second diff.
        self.assertEqual(self.run_guard(scoped=['apps/api/example.ts', 'apps/api/README.md']), 1)

    def test_diff_failure_fails_even_with_exemption(self):
        self.assertEqual(self.run_guard(scoped=['apps/api/example.ts'], git_failure=True,
                                       body='Docs: not needed because test fixture'), 128)

    def test_many_paths_no_broken_pipe(self):
        paths = [f'apps/web/file {i}.ts' for i in range(10000)]
        self.assertEqual(self.run_guard(scoped=paths, markdown=['docs/guide.md']), 0)

    def test_markdown_diff_failure_also_fails(self):
        self.assertEqual(self.run_guard(scoped=['apps/api/example.ts'], docs_git_failure=True,
                                       body='Docs: not needed because test fixture'), 128)

    def test_filename_newlines_do_not_split_the_diff(self):
        self.assertEqual(self.run_guard(scoped=['apps/api/file\nname.ts'],
                                       markdown=['docs/file\nname.md']), 0)


if __name__ == '__main__':
    unittest.main()
