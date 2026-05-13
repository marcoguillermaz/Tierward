import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
        structuredClone: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-constant-condition': 'error',
      'no-debugger': 'error',
      'no-duplicate-case': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-redeclare': 'error',
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
    },
  },
  {
    ignores: ['node_modules/', 'templates/', 'test/integration/output/'],
  },
];
