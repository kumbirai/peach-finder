import { sveltekit } from '@sveltejs/kit/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
	const loaded = loadEnv(mode, process.cwd(), '');
	for (const [key, value] of Object.entries(loaded)) {
		process.env[key] ??= value;
	}

	return {
		plugins: [sveltekit()],
		test: {
			expect: { requireAssertions: true },
			environment: 'node',
			include: ['src/**/*.test.ts'],
			exclude: ['src/**/*.integration.test.ts', 'src/**/*.svelte.{test,spec}.{js,ts}']
		}
	};
});
