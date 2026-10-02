import { createHash, randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Private store for original uploaded documents. The local-disk implementation
 * can be replaced by S3 later by providing another implementation of this
 * abstract class under the same token.
 */
export abstract class IntakeStorage {
  /** Persist bytes under a key. Never overwrites an existing object. */
  abstract put(key: string, data: Buffer): Promise<void>;
  /** Read bytes; throws when the SHA-256 checksum does not match `expectedSha256`. */
  abstract get(key: string, expectedSha256: string): Promise<Buffer>;
  /** Remove an object; missing objects are ignored. */
  abstract delete(key: string): Promise<void>;
}

export function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Non-guessable key `${orgId}/${yyyy}/${mm}/${random}` (128+ bits of randomness). */
export function buildIntakeStorageKey(organizationId: string, now: Date = new Date()): string {
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${organizationId}/${yyyy}/${mm}/${randomBytes(24).toString('hex')}`;
}

export class IntakeChecksumError extends Error {
  constructor() {
    super('Stored original failed checksum verification');
    this.name = 'IntakeChecksumError';
  }
}

@Injectable()
export class LocalFsIntakeStorage extends IntakeStorage {
  private readonly root: string;

  constructor(config: ConfigService) {
    super();
    this.root = path.resolve(config.get<string>('INTAKE_STORAGE_DIR') || './storage/intake');
  }

  /** Resolve a key inside the root; rejects traversal and absolute keys. */
  private resolveKey(key: string): string {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) {
      throw new InternalServerErrorException('Invalid storage key');
    }
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const full = this.resolveKey(key);
    await fs.mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
    // 'wx' refuses to overwrite; mode applies at creation only, so chmod explicitly too.
    await fs.writeFile(full, data, { flag: 'wx', mode: 0o600 });
    await fs.chmod(full, 0o600);
  }

  async get(key: string, expectedSha256: string): Promise<Buffer> {
    const data = await fs.readFile(this.resolveKey(key));
    if (sha256Hex(data) !== expectedSha256) throw new IntakeChecksumError();
    return data;
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolveKey(key), { force: true });
  }
}
