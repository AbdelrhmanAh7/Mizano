#!/usr/bin/env python3
"""Thin pg_dump/psql orchestration and Mizano restore assertions; no database driver needed."""
import hashlib
import json
import os
from pathlib import Path
import re
import select
import shutil
import subprocess
import sys
import tarfile

HERE = Path(__file__).resolve().parent
STATE_SQL = (HERE / 'backup-state.sql').read_text()


class CheckFailed(ValueError):
    """Only fixed, metadata-only messages authored in this module may reach logs."""



def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def file_hashes(root):
    if not root.is_dir():
        raise CheckFailed('originals directory missing')
    result = {}
    for path in sorted(root.rglob('*')):
        if path.is_symlink():
            raise CheckFailed('originals contain a symlink')
        if path.is_file():
            result[path.relative_to(root).as_posix()] = sha256(path)
        elif not path.is_dir():
            raise CheckFailed('originals contain a special file')
    return result


def verify_files(work, manifest):
    if manifest.get('version') != 1:
        raise CheckFailed('unsupported manifest version')
    if sha256(work / 'db.dump') != manifest['dumpSha256']:
        raise CheckFailed('database dump checksum mismatch')
    actual = file_hashes(work / 'originals')
    if actual != manifest['files']:
        raise CheckFailed('originals manifest checksum mismatch')
    for row in manifest['state']['originals']:
        key = row['key']
        # The app creates organization-prefixed random relative keys. Never follow another path.
        if (not key.startswith(row['organizationId'] + '/') or
                '..' in Path(key).parts or Path(key).is_absolute()):
            raise CheckFailed('original key is outside its organization')
        if actual.get(key) != row['sha256']:
            raise CheckFailed('stored original is missing or differs from extraction evidence')


def compose():
    return ['docker', 'compose', '-f', os.environ['COMPOSE_FILE'], '--env-file', os.environ['ENV_FILE']]


def read_line(process):
    if not select.select([process.stdout], [], [], 30)[0]:
        raise CheckFailed('database snapshot response timed out')
    line = process.stdout.readline()
    if not line:
        raise CheckFailed('database snapshot session ended')
    return line.strip()


def copy_container_originals(container_path, target, state, errors):
    copied = subprocess.run(compose() + ['cp', 'api:' + container_path.rstrip('/') + '/.', str(target)],
                            stdout=errors, stderr=errors, check=False, timeout=3600)
    # A fresh server has no intake folder until the first upload. That is only an empty
    # backup when the database lists no originals; otherwise the copy really failed.
    if copied.returncode != 0 and state.get('originals'):
        raise CheckFailed('originals copy failed')


def create(work):
    work.mkdir(parents=True, exist_ok=True)
    user = os.environ.get('POSTGRES_USER', 'mizano')
    database = os.environ.get('POSTGRES_DB', 'mizano_db')
    prefix = compose() + ['exec', '-T', 'postgres']
    # Database/tool errors may contain document values: discard raw diagnostics.
    with open(os.devnull, 'w') as errors:
        # Keep the exporting transaction open until BOTH dump and accounting manifest exist.
        session = subprocess.Popen(prefix + ['psql', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', database],
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=errors, text=True)
        try:
            session.stdin.write('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT pg_export_snapshot();\n')
            session.stdin.flush()
            snapshot = read_line(session)
            if not re.fullmatch(r'[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+', snapshot):
                raise CheckFailed('invalid exported snapshot')
            with (work / 'db.dump').open('wb') as dump:
                subprocess.run(prefix + ['pg_dump', '-U', user, '-d', database, '-Fc', '--snapshot=' + snapshot],
                               stdout=dump, stderr=errors, check=True, timeout=3600)
            session.stdin.write(STATE_SQL + '\nCOMMIT;\n')
            session.stdin.flush()
            state = json.loads(read_line(session))
            session.stdin.close()
            if session.wait(timeout=30) != 0:
                raise CheckFailed('database snapshot failed')
        finally:
            if session.stdin and not session.stdin.closed:
                session.stdin.close()
            if session.poll() is None:
                session.terminate()
                try:
                    session.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    session.kill()
                    session.wait()
        target = work / 'originals'
        target.mkdir(mode=0o700)
        container_path = os.environ.get('BACKUP_ORIGINALS_CONTAINER_PATH')
        if container_path:
            copy_container_originals(container_path, target, state, errors)
        else:
            source = Path(os.environ.get('BACKUP_ORIGINALS_DIR', os.environ['DATA_DIR'] + '/originals'))
            if not source.is_dir():
                raise CheckFailed('originals directory missing')
            if source.resolve() == work.resolve() or source.resolve() in work.resolve().parents:
                raise CheckFailed('originals source contains backup staging directory')
            shutil.copytree(source, target, dirs_exist_ok=True, symlinks=True)
    manifest = {'version': 1, 'dumpSha256': sha256(work / 'db.dump'),
                'files': file_hashes(target), 'state': state}
    verify_files(work, manifest)
    (work / 'manifest.json').write_text(json.dumps(manifest, sort_keys=True) + '\n')


def unpack(archive, work):
    with tarfile.open(archive) as bundle:
        members = bundle.getmembers()
        for member in members:
            path = Path(member.name)
            if path.is_absolute() or '..' in path.parts or not (member.isfile() or member.isdir()):
                raise CheckFailed('unsafe backup archive entry')
            if path.parts[0] not in ('db.dump', 'originals', 'manifest.json'):
                raise CheckFailed('unexpected backup archive entry')
        # No symlinks, devices or traversal passed the checks above; data filter on newer Python.
        if hasattr(tarfile, 'data_filter'):
            bundle.extractall(work, members=members, filter='data')
        else:
            bundle.extractall(work, members=members)
    manifest = json.loads((work / 'manifest.json').read_text())
    verify_files(work, manifest)


def verify_database(container, work):
    manifest = json.loads((work / 'manifest.json').read_text())
    actual = subprocess.check_output(['docker', 'exec', '-i', container, 'psql', '-XqAt',
                                     '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'drill'],
                                    input=STATE_SQL, text=True, timeout=120)
    state = json.loads(actual)
    if state != manifest['state']:
        raise CheckFailed('per-organization counts or intake links changed during restore')
    if any(state['checks'].values()):
        raise CheckFailed('unbalanced ledger or broken tenant/document/journal links')
    print(f"organizations={len(state['counts'])} originals={len(manifest['files'])} "
          f"linked_drafts={state['linkedDrafts']} checks=all-zero")


def main():
    try:
        command = sys.argv[1]
        if command == 'create':
            create(Path(sys.argv[2]))
        elif command == 'unpack':
            unpack(Path(sys.argv[2]), Path(sys.argv[3]))
        elif command == 'verify-db':
            verify_database(sys.argv[2], Path(sys.argv[3]))
        else:
            raise CheckFailed('unknown manifest command')
    except CheckFailed as error:
        print('Backup manifest check failed: ' + str(error), file=sys.stderr)
        return 1
    except Exception as error:
        # External errors may contain SQL or paths: log only their class, never the object.
        print('Backup manifest check failed (' + type(error).__name__ + ')', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
