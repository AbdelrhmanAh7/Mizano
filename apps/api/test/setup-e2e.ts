/**
 * E2E test setup
 * Configures test environment for end-to-end API testing.
 * Requires a running PostgreSQL and Redis instance.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'e2e-test-jwt-secret-key-that-is-long-enough';
process.env.JWT_REFRESH_SECRET = 'e2e-test-jwt-refresh-secret-key-that-is-long-enough';

// AI schedulers are opt-in: e2e runs must never depend on them, and issue #133
// AC3 asserts the registry has no AI cron jobs when the flag is unset at module
// load. Unset it here (before any spec imports AppModule) so CI/dev machines
// with the flag exported cannot change that contract.
delete process.env.AI_SCHEDULERS_ENABLED;

// Increase timeout for E2E tests (database operations)
jest.setTimeout(60000);
