/**
 * Secure temporary storage for OCR / PDF processing.
 *
 * Predictable names in the shared temp directory (`mizano_ocr_<timestamp>.jpg`)
 * let another local user pre-create, read or swap files (symlink and race
 * attacks). These helpers create a private directory with `mkdtemp`
 * (mode 0700), use unguessable `crypto.randomUUID()` file names, write with
 * `wx` (never follow or overwrite) and mode 0600, and always remove the whole
 * directory when the work finishes or fails.
 */

import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Private directory (mode 0700) under the OS temp dir. */
export async function createSecureTempDir(prefix: string = 'mizano-'): Promise<string> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), prefix));
  // mkdtemp already uses 0700 on POSIX; chmod makes the intent explicit and is a no-op on Windows.
  await fs.promises.chmod(dir, 0o700);
  return dir;
}

/** Unguessable file path inside `dir`; `extension` must include the leading dot. */
export function secureTempFilePath(dir: string, extension: string = ''): string {
  const safeExtension = /^\.[A-Za-z0-9]{1,8}$/.test(extension) ? extension : '';
  return path.join(dir, `${randomUUID()}${safeExtension}`);
}

/** Write `data` to `filePath` exclusively (fails if it exists) with mode 0600. */
export async function writeSecureFile(
  filePath: string,
  data: Buffer | string,
  encoding?: BufferEncoding,
): Promise<void> {
  await fs.promises.writeFile(filePath, data, { flag: 'wx', mode: 0o600, encoding });
}

/** Remove a directory tree, never throwing (cleanup must not mask the real error). */
export async function removeSecureTempDir(dir: string): Promise<void> {
  try {
    await fs.promises.rm(dir, { recursive: true, force: true });
  } catch {
    // best effort: the OS temp cleaner is the backstop
  }
}

/**
 * Run `work` with a fresh private temp directory and delete it afterwards,
 * whether `work` resolves or throws.
 */
export async function withSecureTempDir<T>(
  prefix: string,
  work: (dir: string) => Promise<T>,
): Promise<T> {
  const dir = await createSecureTempDir(prefix);
  try {
    return await work(dir);
  } finally {
    await removeSecureTempDir(dir);
  }
}
