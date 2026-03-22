module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Enforce type from a strict list
    'type-enum': [
      2,
      'always',
      [
        'feat', // New feature
        'fix', // Bug fix
        'docs', // Documentation only
        'style', // Formatting, missing semicolons, etc. (no code change)
        'refactor', // Code change that neither fixes a bug nor adds a feature
        'perf', // Performance improvement
        'test', // Adding or updating tests
        'build', // Build system or external dependencies
        'ci', // CI configuration
        'chore', // Maintenance tasks
        'revert', // Reverts a previous commit
      ],
    ],
    // Type must be lowercase
    'type-case': [2, 'always', 'lower-case'],
    // Type cannot be empty
    'type-empty': [2, 'never'],
    // Subject cannot be empty
    'subject-empty': [2, 'never'],
    // Subject must be lowercase
    'subject-case': [2, 'always', 'lower-case'],
    // No period at the end of subject
    'subject-full-stop': [2, 'never', '.'],
    // Subject max length 72 chars
    'subject-max-length': [2, 'always', 72],
    // Header max length 100 chars
    'header-max-length': [2, 'always', 100],
    // Body max line length 200 chars
    'body-max-line-length': [2, 'always', 200],
  },
};
