// eslint.config.mjs
import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import prettier from 'eslint-plugin-prettier';

export default defineConfig([
  // ignore build artifacts and minified files
  {
    ignores: ['node_modules', 'dist', 'build', '.next', 'coverage', 'package.json', '.gitignore', 'src/assets/js/font-awesome.min.js', 'src/assets/js/tailwind.min.js'],
  },

  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    extends: [js.configs.recommended, ...tseslint.configs.recommended, eslintConfigPrettier],
    plugins: {
      prettier,
    },
    rules: {
      'no-unused-vars': 'warn',
      'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
      'max-lines': ['warn', { max: 800, skipBlankLines: true, skipComments: true }],
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  // Disable Prettier for constants files to preserve hex case
  {
    files: ['**/constants/**/*.js'],
    rules: {
      'prettier/prettier': 'off',
    },
  },
]);
