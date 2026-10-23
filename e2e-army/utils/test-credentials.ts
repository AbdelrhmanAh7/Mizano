/**
 * Test credentials helper for e2e-army tests.
 * Loads credentials from environment variables with clear error messages.
 * Never hardcodes credentials - all values must come from process.env.
 *
 * Credentials must be set in CI via environment variables:
 * - E2E_LOGIN_EMAIL (or TEST_USER_EMAIL)
 * - E2E_LOGIN_PASSWORD (or TEST_USER_PASSWORD)
 * For local test runs, placeholder values can be provided in .env.test (ignored by git).
 */

import * as fs from 'fs';
import * as path from 'path';

/** Credentials for the seeded demo admin user in e2e test environments. */
export interface TestCredentials {
  email: string;
  password: string;
}

/**
 * Load test credentials from environment variables.
 * Throws a descriptive error if required variables are not set.
 *
 * Supported environment variables:
 * - E2E_LOGIN_EMAIL or TEST_USER_EMAIL: Email for the test admin user
 * - E2E_LOGIN_PASSWORD or TEST_USER_PASSWORD: Password for the test admin user
 */
export function loadTestCredentials(): TestCredentials {
  let email = process.env.E2E_LOGIN_EMAIL || process.env.TEST_USER_EMAIL;
  let password = process.env.E2E_LOGIN_PASSWORD || process.env.TEST_USER_PASSWORD;

  if (!email || !password) {
    // Attempt to load .env.test for local runs if present
    try {
      const cwd = typeof process.cwd === 'function' ? process.cwd() : '.';
      const envPath = path.resolve(cwd, '.env.test');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const lines = envContent.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx === -1) continue;
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim();
          if (!email && (key === 'E2E_LOGIN_EMAIL' || key === 'TEST_USER_EMAIL')) {
            email = val;
          } else if (!password && (key === 'E2E_LOGIN_PASSWORD' || key === 'TEST_USER_PASSWORD')) {
            password = val;
          }
        }
      }
    } catch {
      // ignore file read error
    }
  }

  if (!email || !password) {
    throw new Error(
      'Missing required environment variables for e2e tests:\n' +
      '  E2E_LOGIN_EMAIL (or TEST_USER_EMAIL) - email for test admin user\n' +
      '  E2E_LOGIN_PASSWORD (or TEST_USER_PASSWORD) - password for test admin user\n' +
      'These must be configured in CI or provided locally via .env.test.'
    );
  }

  return { email, password };
}

/**
 * Load test credentials as an object with `pw` key (for compatibility with existing tests).
 * @deprecated Use loadTestCredentials() and destructure { email, password } instead.
 */
export function loadTestCredentialsLegacy(): { email: string; pw: string } {
  const { email, password } = loadTestCredentials();
  return { email, pw: password };
}
