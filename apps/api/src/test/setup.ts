/**
 * Global test setup for unit tests
 */
import { Logger } from '@nestjs/common';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';

// Increase timeout for AI model tests
jest.setTimeout(30000);

// Silence NestJS Logger output during tests to keep console clean
jest.spyOn(Logger.prototype, 'error').mockImplementation();
jest.spyOn(Logger.prototype, 'warn').mockImplementation();
jest.spyOn(Logger.prototype, 'log').mockImplementation();
