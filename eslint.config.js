import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default [
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	...svelte.configs['flat/prettier'],
	prettier,
	{
		rules: {
			'no-empty': ['error', { allowEmptyCatch: true }]
		}
	},
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser
			}
		},
		rules: {
			'svelte/no-unused-svelte-ignore': 'error'
		}
	},
	{
		files: ['**/*.svelte.js', '**/*.svelte.ts'],
		languageOptions: {
			parser: ts.parser,
			parserOptions: {
				sourceType: 'module'
			}
		}
	},
	{
		ignores: [
			'build/',
			'.svelte-kit/',
			'dist/',
			'node_modules/',
			'.temp/',
			'.wrangler/',
			'static/themes/'
		]
	}
];
