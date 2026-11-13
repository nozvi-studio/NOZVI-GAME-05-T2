import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-types/**',
      'spike/**',
      'coverage/**',
      '**/playwright-report/**',
      'docs/layout/*.mjs',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['apps/web/src/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['packages/protocol/**/*.ts', 'apps/web/src/net/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: ['react', 'react-dom', 'three'] }],
    },
  },
);
