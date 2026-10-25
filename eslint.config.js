import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'apps/web/**', 'archive/**', 'design/**', 'outputs/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/office/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      // Rendering raw HTML is how the prototype got its XSS path. Not allowed here.
      'no-restricted-syntax': [
        'error',
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'Raw HTML is not allowed. Render text through React.' },
        { selector: "MemberExpression[property.name='innerHTML']", message: 'innerHTML is not allowed. Render through React.' },
      ],
      'no-alert': 'error',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
    },
  },
);
