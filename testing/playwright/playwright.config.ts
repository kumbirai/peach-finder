import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import {
	buildWebServerCommand,
	loadDotEnv,
	resolveE2eBaseUrl,
	resolveE2ePort
} from '../../src/lib/playwright-env';

const repoRoot = path.resolve(__dirname, '../..');
const port = resolveE2ePort();
const baseURL = resolveE2eBaseUrl(port);

function definedEnv(source: Record<string, string | undefined>): Record<string, string> {
	return Object.fromEntries(
		Object.entries(source).filter((entry): entry is [string, string] => entry[1] !== undefined)
	);
}

export default defineConfig({
	testDir: '.',
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
		cwd: repoRoot,
		env: definedEnv({ ...loadDotEnv(path.join(repoRoot, '.env')), ...process.env })
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
