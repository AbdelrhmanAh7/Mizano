/**
 * E2E test setup
 * Configures test environment for end-to-end API testing.
 * Requires a running PostgreSQL and Redis instance.
 */

process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';
if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('5435')) {
  process.env.DATABASE_URL =
    'postgresql://mizano:mizano_secret@localhost:5432/mizano_db?schema=public';
}
if (!process.env.REDIS_URL || process.env.REDIS_URL.includes('6380')) {
  process.env.REDIS_URL = 'redis://localhost:6379';
}
delete process.env.READ_DATABASE_URL;
process.env.JWT_SECRET = 'e2e-test-jwt-secret-key-that-is-long-enough';
process.env.JWT_REFRESH_SECRET = 'e2e-test-jwt-refresh-secret-key-that-is-long-enough';

// Increase timeout for E2E tests (database operations)
jest.setTimeout(60000);
