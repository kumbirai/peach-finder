import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		expect: { requireAssertions: true },
		environment: 'node',
		include: ['src/**/*.integration.test.ts'],
		testTimeout: 90_000,
		hookTimeout: 90_000,
		fileParallelism: false
	}
});
