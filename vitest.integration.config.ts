import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const loaded = loadEnv('test', process.cwd(), '');

export default defineConfig({
	test: {
		expect: { requireAssertions: true },
		environment: 'node',
		include: ['src/**/*.integration.test.ts'],
		testTimeout: 180_000,
		hookTimeout: 180_000,
		fileParallelism: false,
		env: {
			...loaded,
			ALLOW_DEV_HELPERS: '1',
			SMTP_HOST: loaded.SMTP_HOST || '127.0.0.1',
			SMTP_PORT: loaded.SMTP_PORT || '1025',
			SMTP_FROM: loaded.SMTP_FROM || 'Peach Finder <noreply@peachfinder.local>'
		}
	}
});
