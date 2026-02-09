const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

/** @type {import('jest').Config} */
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(lucide-react)/)',
  ],
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: [
    '**/*.spec.tsx',
    '**/*.spec.ts',
    '**/*.test.tsx',
    '**/*.test.ts',
  ],
};

module.exports = createJestConfig(customJestConfig);
