/** The API never imports web code (and the web never imports API code: apps/web/.eslintrc.json). */
const NO_WEB_IMPORTS = {
  group: ['**/apps/web/**', '**/web/app/**', '**/web/lib/**'],
  message: 'The API never imports web code.',
};

module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: ['plugin:@typescript-eslint/recommended', 'plugin:prettier/recommended'],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'dist/', 'node_modules/'],
  overrides: [
    // Module boundaries (docs/ARCHITECTURE.md): a module may use another module only through its
    // exported services, its module class and its DTOs (the public contract). Controllers, guards,
    // utils and gateways are internal; shared helpers live in src/common. Patterns are per file
    // depth because the imports are relative.
    ...[1, 2, 3, 4].map((depth) => {
      const up = '../'.repeat(depth);
      return {
        files: [`src/modules/*/${'*/'.repeat(depth - 1)}*.ts`],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                NO_WEB_IMPORTS,
                {
                  group: ['controllers', 'guards', 'utils', 'gateways'].flatMap((dir) => [
                    `${up}*/${dir}/*`,
                    `${up}*/${dir}/**`,
                  ]),
                  message:
                    "Another module's internals: import its exported service (or DTO), or move the shared helper to src/common.",
                },
                {
                  group: [`${up}*/*.controller`, `${up}*/*.gateway`],
                  message: "Another module's internals: import its exported service instead.",
                },
              ],
            },
          ],
        },
      };
    }),
    {
      files: ['test/**/*.ts', 'src/**/*.spec.ts', 'src/**/__tests__/**/*.ts'],
      parserOptions: {
        project: null,
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-floating-promises': 'off',
        '@typescript-eslint/no-misused-promises': 'off',
        '@typescript-eslint/return-await': 'off',
      },
    },
  ],
  rules: {
    // TypeScript strict rules
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-floating-promises': 'warn',
    '@typescript-eslint/no-misused-promises': 'warn',

    // Code quality
    'no-console': ['error', { allow: ['warn', 'error'] }],
    'no-restricted-imports': ['error', { patterns: [NO_WEB_IMPORTS] }],
    'no-return-await': 'off',
    '@typescript-eslint/return-await': ['error', 'in-try-catch'],

    '@typescript-eslint/no-var-requires': 'warn',
    'prefer-const': 'warn',

    // NestJS conventions
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
  },
};
