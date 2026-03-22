/**
 * E2E test setup
 * Configures test environment for end-to-end API testing.
 * Requires a running PostgreSQL and Redis instance.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'e2e-test-jwt-secret-key-that-is-long-enough';
process.env.JWT_REFRESH_SECRET = 'e2e-test-jwt-refresh-secret-key-that-is-long-enough';

// Increase timeout for E2E tests (database operations)
jest.setTimeout(60000);
