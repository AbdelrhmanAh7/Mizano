"""Offline regression checks; the real Docker/restic drill is a separate, explicit test."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('backup_manifest', HERE / 'backup-manifest.py')
MANIFEST = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MANIFEST)


class ManifestTest(unittest.TestCase):
    def fixture(self, folder):
        (folder / 'db.dump').write_bytes(b'PGDMP synthetic unit fixture')
        original = folder / 'originals' / 'org-a' / 'document'
        original.parent.mkdir(parents=True)
        original.write_bytes(b'synthetic original')
        state = {'counts': [{'organizationId': 'org-a', 'rows': {'journals': 1}}],
                 'originals': [{'organizationId': 'org-a', 'key': 'org-a/document',
                                'sha256': MANIFEST.sha256(original)}],
                 'checks': {'unbalancedJournals': 0, 'brokenDrafts': 0}, 'linkedDrafts': 1}
        data = {'version': 1, 'dumpSha256': MANIFEST.sha256(folder / 'db.dump'),
                'files': MANIFEST.file_hashes(folder / 'originals'), 'state': state}
        (folder / 'manifest.json').write_text(json.dumps(data))
        return data

    def test_hashes_bind_originals_to_database_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = self.fixture(root)
            MANIFEST.verify_files(root, data)
            (root / 'originals/org-a/document').write_bytes(b'changed')
            with self.assertRaises(ValueError):
                MANIFEST.verify_files(root, data)

    def test_dump_and_manifest_cannot_disagree(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = self.fixture(root)
            (root / 'db.dump').write_bytes(b'corrupt')
            with self.assertRaises(ValueError):
                MANIFEST.verify_files(root, data)

    def test_fresh_server_without_intake_folder_backs_up_as_empty(self):
        missing = subprocess.CompletedProcess([], 1)
        with tempfile.TemporaryDirectory() as tmp, patch.object(MANIFEST.subprocess, 'run', return_value=missing), \
                patch.object(MANIFEST, 'compose', return_value=['docker']):
            MANIFEST.copy_container_originals('/app/storage/intake', Path(tmp), {'originals': []}, None)
            with self.assertRaises(ValueError):
                MANIFEST.copy_container_originals('/app/storage/intake', Path(tmp),
                                                  {'originals': [{'key': 'org-a/document'}]}, None)

    def test_foreign_original_key_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = self.fixture(root)
            data['state']['originals'][0]['organizationId'] = 'org-b'
            with self.assertRaises(ValueError):
                MANIFEST.verify_files(root, data)

    def test_platform_tar_round_trip_omits_operating_system_metadata(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / 'source'
            source.mkdir()
            self.fixture(source)
            archive = root / 'backup.tar'
            subprocess.run(['tar', '-C', str(source), '-cf', str(archive),
                            'db.dump', 'originals', 'manifest.json'], check=True,
                           env={**os.environ, 'COPYFILE_DISABLE': '1'})
            target = root / 'restored'
            target.mkdir()
            MANIFEST.unpack(archive, target)
            self.assertEqual((target / 'originals/org-a/document').read_bytes(), b'synthetic original')

    def test_archive_traversal_and_links_are_refused(self):
        for name, link in [('../outside', False), ('/db.dump', False), ('originals/link', True)]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                archive = root / 'bad.tar'
                with tarfile.open(archive, 'w') as bundle:
                    member = tarfile.TarInfo(name)
                    if link:
                        member.type = tarfile.SYMTYPE
                        member.linkname = '/etc/passwd'
                    bundle.addfile(member)
                target = root / 'target'
                target.mkdir()
                with self.assertRaises(ValueError):
                    MANIFEST.unpack(archive, target)

    def test_restore_requires_matching_counts_and_balanced_ledger(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = self.fixture(root)
            changed = json.loads(json.dumps(data['state']))
            changed['counts'][0]['rows']['journals'] = 0
            with patch.object(MANIFEST.subprocess, 'check_output', return_value=json.dumps(changed)):
                with self.assertRaises(ValueError):
                    MANIFEST.verify_database('scratch', root)
            data['state']['checks']['unbalancedJournals'] = 1
            (root / 'manifest.json').write_text(json.dumps(data))
            with patch.object(MANIFEST.subprocess, 'check_output', return_value=json.dumps(data['state'])):
                with self.assertRaises(ValueError):
                    MANIFEST.verify_database('scratch', root)

    def test_backup_failure_never_writes_ok_or_leaves_plaintext_staging(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bin_dir = root / 'bin'
            bin_dir.mkdir()
            # Fail before database access. This checks the shell's fail/status/EXIT cleanup path.
            for executable in ('python3', 'restic'):
                path = bin_dir / executable
                path.write_text('#!/bin/sh\nexit 42\n')
                path.chmod(0o700)
            key = root / 'password'
            key.write_bytes(os.urandom(32).hex().encode())
            key.chmod(0o600)
            env_file = root / 'env'
            env_file.write_text(f'MIZANO_DATA_DIR={root / "data"}\nRESTIC_REPOSITORY={root / "repo"}\nRESTIC_PASSWORD_FILE={key}\n')
            result = subprocess.run(['bash', str(HERE / 'backup.sh')], env={**os.environ,
                'PATH': str(bin_dir) + ':' + os.environ['PATH'], 'ENV_FILE': str(env_file)},
                capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            backup_dir = root / 'data/backups'
            self.assertTrue((backup_dir / 'backup.status').read_text().startswith('FAILED '))
            self.assertEqual(list(backup_dir.glob('.backup.*')), [])
            self.assertNotIn(key.read_text(), result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
