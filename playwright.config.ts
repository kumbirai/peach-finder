import { defineConfig, devices } from '@playwright/test';
import {
	buildWebServerCommand,
	loadDotEnv,
	resolveE2eBaseUrl,
	resolveE2ePort
} from './src/lib/playwright-env';

const port = resolveE2ePort();
const baseURL = resolveE2eBaseUrl(port);

export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.e2e.ts',
	fullyParallel: false,
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
		env: { ...loadDotEnv(), ...process.env }
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
