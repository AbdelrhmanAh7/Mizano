const path = require('path');

const root = path.resolve(__dirname, '..', '..');

const tsJestPath = path.join(root, 'node_modules', 'ts-jest');

module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': [
      tsJestPath,
      {
        // Type errors in specs fail `pnpm type-check` (tsconfig.json includes src/**).
        diagnostics: false,
        // Compile specs exactly like the app (no esModuleInterop, so `import * as csv` matches
        // the production build).
        tsconfig: path.join(__dirname, 'tsconfig.json'),
      },
    ],
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  resolver: path.join(__dirname, '_jest_resolver.js'),
  moduleNameMapper: {
    '^@mizano/shared-types$': path.join(root, 'packages/shared-types/src/index.ts'),
    '^@mizano/validators$': path.join(root, 'packages/validators/src/index.ts'),
    '^sharp$': path.join(__dirname, 'src/test/mocks/sharp.mock.js'),
    '^tesseract\\.js$': path.join(__dirname, 'src/test/mocks/tesseract.mock.js'),
  },
};
