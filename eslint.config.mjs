// eslint.config.mjs
import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import prettier from 'eslint-plugin-prettier';

export default defineConfig([
  // ignore build artifacts
  {
    ignores: ['node_modules', 'dist', 'build', '.next', 'coverage', 'package.json', '.gitignore'],
  },

  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    languageOptions: {
      // browser + node if you have scripts/tools
      globals: { ...globals.browser, ...globals.node },
    },
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      // turn off rules that conflict with Prettier
      eslintConfigPrettier,
    ],
    plugins: {
      // run Prettier as an ESLint rule
      prettier,
    },
    rules: {
      'no-unused-vars': 'warn',
    },
  },
]);
