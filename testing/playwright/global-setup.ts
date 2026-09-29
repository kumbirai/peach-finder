import { execSync } from 'node:child_process';
import path from 'node:path';
import {
	buildDatabasePrepCommand,
	resolveE2eBaseUrl,
	resolveE2ePort
} from '../../src/lib/playwright-env';

const repoRoot = path.resolve(__dirname, '../..');

/** Dev helpers return 422 on invalid body; without them the route is 404. */
async function devHelpersEnabled(baseURL: string): Promise<boolean> {
	try {
		const res = await fetch(`${baseURL}/api/dev/otp-code`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{}'
		});
		return res.status === 422;
	} catch {
		return false;
	}
}

/** A reused Vite process can outlive a wiped Postgres volume — confirm the DB is seeded. */
async function liveStackReady(baseURL: string): Promise<boolean> {
	try {
		const res = await fetch(`${baseURL}/api/discovery/search`);
		if (!res.ok) return false;
		const body = (await res.json()) as { data?: unknown };
		return Array.isArray(body.data) && body.data.length > 0;
	} catch {
		return false;
	}
}

function killPort(port: number): void {
	try {
		execSync(`fuser -k ${port}/tcp`, { stdio: 'ignore' });
	} catch {
		// Nothing listening.
	}
}

export default async function globalSetup(): Promise<void> {
	const port = resolveE2ePort();
	const baseURL = resolveE2eBaseUrl(port);
	const helpersOk = await devHelpersEnabled(baseURL);
	const stackReady = helpersOk ? await liveStackReady(baseURL) : false;

	if (!helpersOk || !stackReady) {
		killPort(port);
		if (process.env.PLAYWRIGHT_SKIP_DB_PREP !== '1') {
			execSync(buildDatabasePrepCommand(), { cwd: repoRoot, stdio: 'inherit' });
		}
	}
}
