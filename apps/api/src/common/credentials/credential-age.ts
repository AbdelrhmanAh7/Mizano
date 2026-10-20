export type CredentialAgeStatus = 'ok' | 'due' | 'expired' | 'unknown';

export interface CredentialAge {
  name: string;
  status: CredentialAgeStatus;
}

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Classifies how old a credential is from its rotation date (strict `YYYY-MM-DD`, UTC). Age is
 * counted in whole UTC days: below `maxAgeDays` is `ok`, exactly `maxAgeDays` is `due` (rotate
 * today) and older is `expired`. A missing, malformed, impossible or future date is `unknown`.
 * Takes only the date, never the credential itself.
 */
export function classifyCredentialAge(
  name: string,
  rotatedAtIso: string | null | undefined,
  now: Date,
  maxAgeDays = 90,
): CredentialAge {
  const match = ISO_DATE.exec(rotatedAtIso ?? '');
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (!match || Number.isNaN(today)) return { name, status: 'unknown' };

  const [year, month, day] = match.slice(1).map(Number);
  const rotated = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    rotated.getUTCFullYear() === year &&
    rotated.getUTCMonth() === month - 1 &&
    rotated.getUTCDate() === day;
  const ageDays = (today - rotated.getTime()) / DAY_MS;
  if (!isRealDate || ageDays < 0) return { name, status: 'unknown' };

  const status = ageDays < maxAgeDays ? 'ok' : ageDays === maxAgeDays ? 'due' : 'expired';
  return { name, status };
}
