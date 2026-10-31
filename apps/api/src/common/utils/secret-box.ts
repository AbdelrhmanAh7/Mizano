import { ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * AES-256-GCM for secrets Mizano must use later (webhook signing secrets, AI provider keys). The
 * key comes from INTEGRATIONS_ENCRYPTION_KEY (at least 32 characters, never a default). The
 * organization and record id are bound as additional data, so a ciphertext copied to another row
 * or tenant fails to decrypt. Format: v1.<iv b64>.<tag b64>.<ciphertext b64>.
 */
const MIN_KEY_LENGTH = 32;

function key(): Buffer {
  const raw = process.env.INTEGRATIONS_ENCRYPTION_KEY;
  if (!raw || raw.length < MIN_KEY_LENGTH) {
    throw new ServiceUnavailableException(
      'Integrations are not configured: set INTEGRATIONS_ENCRYPTION_KEY (32+ characters) on the API',
    );
  }
  return createHash('sha256').update(raw, 'utf8').digest();
}

export function integrationsEncryptionConfigured(): boolean {
  const raw = process.env.INTEGRATIONS_ENCRYPTION_KEY;
  return !!raw && raw.length >= MIN_KEY_LENGTH;
}

export function sealSecret(plaintext: string, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ct.toString('base64'),
  ].join('.');
}

export function openSecret(sealed: string, aad: string): string {
  const [v, iv, tag, ct] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('Unknown secret format');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString(
    'utf8',
  );
}

/** "whs…ab12": recognisable, useless to an attacker. */
export function secretHint(secret: string): string {
  return secret.length <= 8 ? '••••' : `${secret.slice(0, 3)}…${secret.slice(-4)}`;
}
