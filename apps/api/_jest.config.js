const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const pnpmStore = path.join(root, 'node_modules', '.pnpm');

const tsJestPath = path.join(
  pnpmStore,
  'ts-jest@29.4.6_@babel+core@7.29.0_jest@29.7.0_typescript@5.9.3',
  'node_modules',
  'ts-jest',
);

module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      tsJestPath,
      {
        diagnostics: false,
        tsconfig: {
          types: ['jest', 'node'],
          module: 'commonjs',
          esModuleInterop: true,
          emitDecoratorMetadata: true,
          experimentalDecorators: true,
          skipLibCheck: true,
        },
      },
    ],
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  resolver: path.join(__dirname, '_jest_resolver.js'),
  moduleNameMapper: {
    '^@mizano/shared-types$': path.join(root, 'packages/shared-types/src/index.ts'),
    '^@mizano/validators$': path.join(root, 'packages/validators/src/index.ts'),
    '^sharp$': path.join(__dirname, 'src/test/mocks/sharp.mock.js'),
    '^tesseract\\.js$': path.join(__dirname, 'src/test/mocks/tesseract.mock.js'),
  },
};
