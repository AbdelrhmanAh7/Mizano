/**
 * E2E test setup
 * Configures test environment for end-to-end API testing.
 * Requires a running PostgreSQL and Redis instance.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'e2e-test-jwt-secret-key-that-is-long-enough';
process.env.JWT_REFRESH_SECRET = 'e2e-test-jwt-refresh-secret-key-that-is-long-enough';
// Every e2e app boots AppModule. A real bot token in a developer's .env would start a live
// Telegram long poller per spec file (409 conflicts with the Pi, real documents into the test
// DB), so polling is disabled here; telegram.e2e-spec.ts drives the service directly.
process.env.TELEGRAM_BOT_TOKEN = '';

// Increase timeout for E2E tests (database operations)
jest.setTimeout(60000);
