"""Execute the workflow's migration/restart block with a failing fake Docker."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class MigrationGateTest(unittest.TestCase):
    def test_failure_keeps_previous_application_containers(self):
        workflow = (ROOT / '.github/workflows/deploy.yml').read_text()
        start = workflow.index('            # Fail before replacing any app container')
        end = workflow.index('            # Seed database', start)
        block = '\n'.join(line[12:] for line in workflow[start:end].splitlines())
        for exit_code in (0, 42):
            with self.subTest(exit_code=exit_code), tempfile.TemporaryDirectory() as tmp:
                folder = Path(tmp)
                docker = folder / 'docker'
                docker.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$CALLS"\n'
                                  'case "$*" in *"run --rm migrate"*) exit "$MIGRATE_EXIT";; esac\n')
                docker.chmod(0o700)
                sleep = folder / 'sleep'
                sleep.write_text('#!/bin/sh\nexit 0\n')
                sleep.chmod(0o700)
                log = folder / 'calls'
                result = subprocess.run(['bash', '-ec', block], env={
                    **os.environ, 'PATH': f'{tmp}:{os.environ["PATH"]}',
                    'CALLS': str(log), 'MIGRATE_EXIT': str(exit_code),
                }, capture_output=True)
                calls = log.read_text().splitlines()
                self.assertEqual(result.returncode, exit_code)
                self.assertIn('run --rm migrate', calls[0])
                if exit_code:
                    self.assertEqual(len(calls), 1)
                else:
                    self.assertEqual(len(calls), 4)
                    self.assertIn('up -d --no-deps api', calls[1])


    def test_environment_check_uses_public_api_default(self):
        with tempfile.TemporaryDirectory() as tmp:
            env_file = Path(tmp) / 'env'
            for url, valid in [('https://api.example.com/api', True),
                               ('https://api.example.com/private', False)]:
                env_file.write_text(f'NODE_ENV=production\nPUBLIC_API_URL={url}\n')
                env = {k: v for k, v in os.environ.items() if k not in
                       ('MCP_PUBLIC_URL', 'PUBLIC_API_URL', 'NEXT_PUBLIC_API_URL')}
                result = subprocess.run(['node', str(ROOT / 'scripts/check-env.js'),
                                         '--', str(env_file)], env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0 if valid else 1)
                self.assertNotIn(url, result.stdout + result.stderr)
                if valid:
                    self.assertIn('MCP: public API origin', result.stdout)


if __name__ == '__main__':
    unittest.main()
