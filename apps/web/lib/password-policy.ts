import { z } from 'zod';

/**
 * The API's password rules (auth/dto/password.dto.ts), so a form never sends a password the
 * server rejects. Each failure message is a `validation.*` message key.
 */
export const passwordSchema = z
  .string()
  .min(8, 'passwordMin')
  .max(128, 'passwordMax')
  .regex(/[A-Z]/, 'passwordUppercase')
  .regex(/[a-z]/, 'passwordLowercase')
  .regex(/[0-9]/, 'passwordNumber');

const PASSWORD_RULES = [
  'passwordMin',
  'passwordMax',
  'passwordUppercase',
  'passwordLowercase',
  'passwordNumber',
] as const;
type PasswordRule = (typeof PASSWORD_RULES)[number];

/** The `validation.*` key for a password failure message. */
export function passwordRule(message: string | undefined): PasswordRule {
  return PASSWORD_RULES.find((rule) => rule === message) ?? 'passwordMin';
}
