import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	buildWebServerCommand,
	loadDotEnv,
	resolveE2eBaseUrl,
	resolveE2ePort
} from './playwright-env';

describe('playwright-env', () => {
	const dirs: string[] = [];

	afterEach(() => {
		for (const dir of dirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('parses simple key=value lines from .env', () => {
		const dir = mkdtempSync(join(tmpdir(), 'pf-dotenv-'));
		dirs.push(dir);
		const envPath = join(dir, '.env');
		writeFileSync(
			envPath,
			['# comment', '', 'DATABASE_URL=postgres://app@localhost/db', 'FLAG=true'].join('\n')
		);

		expect(loadDotEnv(envPath)).toEqual({
			DATABASE_URL: 'postgres://app@localhost/db',
			FLAG: 'true'
		});
	});

	it('returns an empty object when .env is missing', () => {
		expect(loadDotEnv('/tmp/does-not-exist-peach-finder.env')).toEqual({});
	});

	it('defaults E2E port to 5173', () => {
		expect(resolveE2ePort(undefined)).toBe(5173);
		expect(resolveE2ePort('')).toBe(5173);
	});

	it('rejects invalid E2E_PORT values', () => {
		expect(() => resolveE2ePort('abc')).toThrow(/Invalid E2E_PORT/);
		expect(() => resolveE2ePort('0')).toThrow(/Invalid E2E_PORT/);
		expect(() => resolveE2ePort('70000')).toThrow(/Invalid E2E_PORT/);
	});

	it('keeps webServer port aligned with resolved E2E port', () => {
		const port = resolveE2ePort('5199');
		expect(buildWebServerCommand(port)).toBe(
			`npm run db:migrate && SEED_PACK=seed-core npm run db:seed && node --env-file=.env --import tsx scripts/seed-blocking.ts && node --env-file=.env --import tsx scripts/seed-verification.ts && node --env-file=.env --import tsx scripts/seed-reports.ts && node --env-file=.env --import tsx scripts/seed-reviews.ts && ALLOW_DEV_HELPERS=1 npm run dev -- --host 127.0.0.1 --port ${port}`
		);
		expect(resolveE2eBaseUrl(port)).toBe('http://127.0.0.1:5199');
	});

	it('honors E2E_BASE_URL when set', () => {
		expect(resolveE2eBaseUrl(5173, 'http://localhost:3000')).toBe('http://localhost:3000');
	});
});
