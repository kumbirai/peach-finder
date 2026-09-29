import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import {
	buildWebServerCommand,
	e2eWebServerEnv,
	loadDotEnv,
	resolveE2eBaseUrl,
	resolveE2ePort
} from '../../src/lib/playwright-env';

const repoRoot = path.resolve(__dirname, '../..');
const port = resolveE2ePort();
const baseURL = resolveE2eBaseUrl(port);

export default defineConfig({
	testDir: '.',
	globalSetup: path.join(__dirname, 'global-setup.ts'),
	fullyParallel: false,
	workers: 1,
	timeout: 120_000,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	use: {
		baseURL,
		trace: 'on-first-retry'
	},
	webServer: {
		command: buildWebServerCommand(port),
		url: baseURL,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		cwd: repoRoot,
		env: e2eWebServerEnv(baseURL, { ...loadDotEnv(path.join(repoRoot, '.env')), ...process.env })
	},
	projects: [
		{
			name: 'chromium',
			testMatch: '**/*.e2e.ts',
			use: { ...devices['Desktop Chrome'] }
		},
		{
			name: 'chromium-seeding',
			testMatch: 'seeding/**/*.spec.ts',
			use: { ...devices['Desktop Chrome'] }
		}
	]
});
