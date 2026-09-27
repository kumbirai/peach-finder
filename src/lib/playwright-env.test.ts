import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	buildWebServerCommand,
	e2eWebServerEnv,
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

	it('pins PUBLIC_APP_ORIGIN to the Playwright base URL even when .env points at 5173', () => {
		const env = e2eWebServerEnv('http://127.0.0.1:4177', {
			PUBLIC_APP_ORIGIN: 'http://127.0.0.1:5173',
			DATABASE_URL: 'postgres://app@localhost/db'
		});
		expect(env.PUBLIC_APP_ORIGIN).toBe('http://127.0.0.1:4177');
		expect(env.ALLOW_DEV_HELPERS).toBe('1');
		expect(env.DATABASE_URL).toBe('postgres://app@localhost/db');
		expect(env.SMTP_HOST).toBe('127.0.0.1');
		expect(env.SMTP_PORT).toBe('1025');
		expect(env.MAILHOG_URL).toBe('http://127.0.0.1:8025');
	});

	it('keeps the Playwright live-listing helper bound to seed profile + search', () => {
		const source = readFileSync(
			join(process.cwd(), 'testing/playwright/live-backend-assert.ts'),
			'utf8'
		);
		expect(source).toContain('SEED_CORE_PRIMARY_PROFILE_ID');
		expect(source).toContain('/api/discovery/search');
	});

	it('keeps Playwright seeding scripts on the chromium-seeding project', () => {
		const pkg = JSON.parse(
			readFileSync(join(process.cwd(), 'testing/playwright/package.json'), 'utf8')
		) as { scripts: Record<string, string> };
		expect(pkg.scripts.test).toContain('--project=chromium');
		expect(pkg.scripts['test:seeding']).toContain('--project=chromium-seeding');
		expect(pkg.scripts['test:seeding:verify']).toContain('seeding/live-ui-journeys.spec.ts');
	});

	it('keeps docker compose MailHog as the local SMTP2GO stand-in', () => {
		const compose = readFileSync(join(process.cwd(), 'docker-compose.yml'), 'utf8');
		expect(compose).toContain('mailhog/mailhog');
		expect(compose).toContain('mail.smtp2go.com');
		expect(compose).toContain("'1025:1025'");
		expect(compose).toContain("'8025:8025'");
	});

	it('keeps the projection-repair e2e bound to the live reconcile helper', () => {
		const source = readFileSync(
			join(process.cwd(), 'testing/playwright/availability-projection-repair.e2e.ts'),
			'utf8'
		);
		expect(source).toContain('/api/dev/search-projection-reconcile');
		expect(source).toContain('corrupt_availability');
	});
});
