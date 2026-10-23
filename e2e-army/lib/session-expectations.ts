/**
 * Session expectation builder for e2e-army session-shape test.
 * Pure, network-free helper that decides between seed and override mode
 * based on the effective login email.
 */

export const SEED_EMAIL = 'admin@mizano.com';

export const SEED_USER = {
  id: 'user-admin',
  name: 'Admin User',
  firstName: 'Admin',
  lastName: 'User',
  organizationId: 'seed-org-001',
  role: 'Admin',
} as const;

/** Mode of the session expectation. */
export type ExpectationMode = 'seed' | 'override';

/** Expectation for a single user field. */
type FieldExpectation =
  | { kind: 'exact'; value: string }
  | { kind: 'nonEmptyString' }
  | { kind: 'email'; value: string };

/** Complete session user expectation. */
export interface SessionUserExpectation {
  id: FieldExpectation;
  email: FieldExpectation;
  name: FieldExpectation;
  firstName: FieldExpectation;
  lastName: FieldExpectation;
  organizationId: FieldExpectation;
  role: FieldExpectation;
}

/** Full session expectation including mode. */
export interface SessionExpectation {
  mode: ExpectationMode;
  user: SessionUserExpectation;
}

/**
 * Normalizes an email: trims whitespace and lowercases.
 * Returns empty string if input is empty/whitespace only.
 */
function normalizeEmail(email: string | undefined): string {
  if (!email) return '';
  const trimmed = email.trim();
  if (!trimmed) return '';
  return trimmed.toLowerCase();
}

/**
 * Determines if the effective email matches the seed email.
 * Empty/whitespace email is treated as unset (seed mode).
 * Comparison is case-insensitive.
 */
function isSeedEmail(effectiveEmail: string): boolean {
  return effectiveEmail === SEED_EMAIL.toLowerCase();
}

/**
 * Builds the session expectation from environment variables.
 * @param env - Environment variables (E2E_USER_EMAIL, E2E_USER_PASSWORD)
 * @returns SessionExpectation with mode and per-field expectations
 */
export function buildSessionExpectation(env: {
  E2E_USER_EMAIL?: string;
  E2E_USER_PASSWORD?: string;
}): SessionExpectation {
  const effectiveEmail = normalizeEmail(env.E2E_USER_EMAIL);
  const mode: ExpectationMode =
    effectiveEmail && !isSeedEmail(effectiveEmail) ? 'override' : 'seed';

  if (mode === 'seed') {
    return {
      mode: 'seed',
      user: {
        id: { kind: 'exact', value: SEED_USER.id },
        email: { kind: 'exact', value: SEED_EMAIL },
        name: { kind: 'exact', value: SEED_USER.name },
        firstName: { kind: 'exact', value: SEED_USER.firstName },
        lastName: { kind: 'exact', value: SEED_USER.lastName },
        organizationId: { kind: 'exact', value: SEED_USER.organizationId },
        role: { kind: 'exact', value: SEED_USER.role },
      },
    };
  }

  // Override mode: all fields non-empty string, email matches override
  return {
    mode: 'override',
    user: {
      id: { kind: 'nonEmptyString' },
      email: { kind: 'email', value: effectiveEmail },
      name: { kind: 'nonEmptyString' },
      firstName: { kind: 'nonEmptyString' },
      lastName: { kind: 'nonEmptyString' },
      organizationId: { kind: 'nonEmptyString' },
      role: { kind: 'nonEmptyString' },
    },
  };
}

/**
 * Asserts that a session user matches the expectation.
 * Throws with a clear field name if any assertion fails.
 * Never includes the password in messages.
 */
export function assertSessionMatches(
  user: Record<string, unknown> | null | undefined,
  expectation: SessionExpectation,
): void {
  if (!user) {
    throw new Error('Session user is missing (null or undefined)');
  }

  const fields: (keyof SessionUserExpectation)[] = [
    'id',
    'email',
    'name',
    'firstName',
    'lastName',
    'organizationId',
    'role',
  ];

  for (const field of fields) {
    const expected = expectation.user[field];
    const actual = user[field];

    switch (expected.kind) {
      case 'exact': {
        if (actual !== expected.value) {
          throw new Error(
            `Session user field "${field}" does not match seed value: expected "${expected.value}", got "${actual}"`,
          );
        }
        break;
      }
      case 'nonEmptyString': {
        if (typeof actual !== 'string' || actual.length === 0) {
          throw new Error(
            `Session user field "${field}" must be a non-empty string, got ${JSON.stringify(actual)}`,
          );
        }
        break;
      }
      case 'email': {
        if (typeof actual !== 'string' || actual.trim().toLowerCase() !== expected.value) {
          throw new Error(
            `Session user field "email" does not match override email: expected "${expected.value}", got "${actual}"`,
          );
        }
        break;
      }
    }
  }
}
