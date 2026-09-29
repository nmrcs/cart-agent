import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
	js.configs.recommended,
	...tseslint.configs.recommended,
	prettier,
	{
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
		},
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
			],
			'@typescript-eslint/no-explicit-any': 'warn',
		},
	},
	{
		// Only the frontend runs in a browser: declaring these globals repo-wide
		// would let the backend use `window` or `localStorage`.
		files: ['apps/frontend/**/*.{ts,tsx}'],
		languageOptions: {
			globals: {
				window: 'readonly',
				document: 'readonly',
				localStorage: 'readonly',
				console: 'readonly',
				fetch: 'readonly',
				setInterval: 'readonly',
				clearInterval: 'readonly',
			},
		},
		plugins: {
			'react-hooks': reactHooks,
			'react-refresh': reactRefresh,
		},
		rules: {
			...reactHooks.configs.recommended.rules,
			'react-refresh/only-export-components': [
				'warn',
				{ allowConstantExport: true },
			],
		},
	},
	{
		ignores: [
			'**/dist',
			'**/node_modules',
			'apps/backend/prisma/migrations',
			'apps/backend/src/generated',
		],
	},
]
