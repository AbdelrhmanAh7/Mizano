import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  createSecureTempDir,
  removeSecureTempDir,
  secureTempFilePath,
  withSecureTempDir,
  writeSecureFile,
} from './secure-temp.util';

describe('secure temp storage', () => {
  const created: string[] = [];

  afterEach(async () => {
    for (const dir of created.splice(0)) await removeSecureTempDir(dir);
  });

  it('creates a unique directory under the OS temp dir with an unguessable name', async () => {
    const a = await createSecureTempDir('mizano-test-');
    const b = await createSecureTempDir('mizano-test-');
    created.push(a, b);

    expect(a).not.toBe(b);
    expect(path.dirname(a)).toBe(path.resolve(os.tmpdir()));
    expect(path.basename(a)).toMatch(/^mizano-test-[A-Za-z0-9]{6}$/);
    expect(fs.statSync(a).isDirectory()).toBe(true);
  });

  it('creates directories that are private to the owner (POSIX modes)', async () => {
    if (process.platform === 'win32') return; // POSIX modes are not meaningful on Windows
    const dir = await createSecureTempDir('mizano-test-');
    created.push(dir);
    expect(fs.statSync(dir).mode & 0o777).toBe(0o700);

    const file = secureTempFilePath(dir, '.txt');
    await writeSecureFile(file, 'data');
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it('uses random UUID file names, not timestamps or sequences', () => {
    const dir = os.tmpdir();
    const a = secureTempFilePath(dir, '.jpg');
    const b = secureTempFilePath(dir, '.jpg');
    expect(a).not.toBe(b);
    expect(path.basename(a)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/,
    );
  });

  it('drops suspicious extensions instead of using them', () => {
    const dir = os.tmpdir();
    for (const extension of ['../evil', '.a/b', '.', 'jpg', '.toolongextension']) {
      const file = secureTempFilePath(dir, extension);
      expect(path.dirname(file)).toBe(dir);
      expect(path.extname(file)).toBe('');
    }
  });

  it('writes exclusively: never overwrites or follows an existing file', async () => {
    const dir = await createSecureTempDir('mizano-test-');
    created.push(dir);
    const file = secureTempFilePath(dir, '.bin');

    await writeSecureFile(file, Buffer.from('first'));
    await expect(writeSecureFile(file, Buffer.from('second'))).rejects.toMatchObject({
      code: 'EEXIST',
    });
    expect(fs.readFileSync(file, 'utf8')).toBe('first');
  });

  describe('withSecureTempDir', () => {
    it('removes the directory and its files after success', async () => {
      let seen = '';
      const result = await withSecureTempDir('mizano-test-', async (dir) => {
        seen = dir;
        await writeSecureFile(secureTempFilePath(dir, '.pdf'), 'x');
        expect(fs.existsSync(dir)).toBe(true);
        return 42;
      });

      expect(result).toBe(42);
      expect(fs.existsSync(seen)).toBe(false);
    });

    it('removes the directory even when the work throws, and rethrows the original error', async () => {
      let seen = '';
      await expect(
        withSecureTempDir('mizano-test-', async (dir) => {
          seen = dir;
          await writeSecureFile(secureTempFilePath(dir, '.pdf'), 'x');
          throw new Error('ocr exploded');
        }),
      ).rejects.toThrow('ocr exploded');

      expect(fs.existsSync(seen)).toBe(false);
    });

    it('cleanup of an already-removed directory never throws', async () => {
      await expect(
        removeSecureTempDir(path.join(os.tmpdir(), 'mizano-missing-xyz')),
      ).resolves.toBeUndefined();
    });
  });
});
