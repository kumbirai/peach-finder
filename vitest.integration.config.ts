import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const loaded = loadEnv('test', process.cwd(), '');

export default defineConfig({
	test: {
		expect: { requireAssertions: true },
		environment: 'node',
		include: ['src/**/*.integration.test.ts'],
		testTimeout: 90_000,
		hookTimeout: 90_000,
		fileParallelism: false,
		env: {
			...loaded,
			ALLOW_DEV_HELPERS: '1',
			SMTP_HOST: ''
		}
	}
});
