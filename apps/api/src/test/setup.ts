/**
 * Global test setup for unit tests
 */

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';

// Increase timeout for AI model tests
jest.setTimeout(30000);
