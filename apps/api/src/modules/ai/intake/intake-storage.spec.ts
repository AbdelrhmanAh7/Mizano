import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import {
  buildIntakeStorageKey,
  IntakeChecksumError,
  LocalFsIntakeStorage,
  sha256Hex,
} from './intake-storage';

describe('LocalFsIntakeStorage', () => {
  let root: string;
  let storage: LocalFsIntakeStorage;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'intake-'));
    storage = new LocalFsIntakeStorage({ get: () => root } as unknown as ConfigService);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('round-trips bytes and verifies the checksum', async () => {
    const data = Buffer.from('original bytes');
    const key = buildIntakeStorageKey('org-a', new Date('2026-09-05T10:00:00Z'));
    expect(key).toMatch(/^org-a\/2026\/09\/[0-9a-f]{48}$/);
    await storage.put(key, data);
    await expect(storage.get(key, sha256Hex(data))).resolves.toEqual(data);
  });

  it('rejects tampered content', async () => {
    const data = Buffer.from('original bytes');
    const key = buildIntakeStorageKey('org-a');
    await storage.put(key, data);
    await fs.writeFile(path.join(root, key), 'tampered');
    await expect(storage.get(key, sha256Hex(data))).rejects.toBeInstanceOf(IntakeChecksumError);
  });

  it('never overwrites an existing object', async () => {
    const key = buildIntakeStorageKey('org-a');
    await storage.put(key, Buffer.from('one'));
    await expect(storage.put(key, Buffer.from('two'))).rejects.toThrow();
  });

  it('refuses keys that escape the storage root', async () => {
    await expect(storage.put('../escape', Buffer.from('x'))).rejects.toThrow();
    await expect(storage.get('/etc/passwd', 'x')).rejects.toThrow();
  });

  it('uses restrictive permissions where the platform supports them', async () => {
    const key = buildIntakeStorageKey('org-a');
    await storage.put(key, Buffer.from('x'));
    if (process.platform !== 'win32') {
      expect((await fs.stat(path.join(root, key))).mode & 0o777).toBe(0o600);
    }
  });

  it('deletes objects and ignores missing ones', async () => {
    const key = buildIntakeStorageKey('org-a');
    await storage.put(key, Buffer.from('x'));
    await storage.delete(key);
    await storage.delete(key);
    await expect(storage.get(key, 'x')).rejects.toThrow();
  });

  it('generates distinct unguessable keys', () => {
    expect(buildIntakeStorageKey('o')).not.toBe(buildIntakeStorageKey('o'));
  });
});
