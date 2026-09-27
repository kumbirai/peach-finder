import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSmtpSettings, SMTP2GO_HOST, SMTP2GO_PORT } from './smtp-settings';

describe('SMTP settings', () => {
	it('returns null when SMTP_HOST is unset so tests stay offline', () => {
		expect(parseSmtpSettings({})).toBeNull();
		expect(parseSmtpSettings({ SMTP_HOST: '  ' })).toBeNull();
	});

	it('defaults local MailHog to port 1025 without credentials', () => {
		expect(parseSmtpSettings({ SMTP_HOST: '127.0.0.1', SMTP_FROM: 'Peach Finder <n@x>' })).toEqual({
			host: '127.0.0.1',
			port: 1025,
			secure: false,
			user: undefined,
			pass: undefined,
			from: 'Peach Finder <n@x>'
		});
	});

	it('defaults SMTP2GO production host to port 2525 and requires auth', () => {
		expect(() => parseSmtpSettings({ SMTP_HOST: SMTP2GO_HOST })).toThrow(/SMTP_USER/);
		expect(
			parseSmtpSettings({
				SMTP_HOST: SMTP2GO_HOST,
				SMTP_USER: 'smtp-user',
				SMTP_PASS: 'smtp-pass',
				SMTP_FROM: 'Peach Finder <noreply@peachfinder.com>'
			})
		).toEqual({
			host: SMTP2GO_HOST,
			port: SMTP2GO_PORT,
			secure: false,
			user: 'smtp-user',
			pass: 'smtp-pass',
			from: 'Peach Finder <noreply@peachfinder.com>'
		});
	});

	it('documents MailHog ports next to the SMTP2GO production host', () => {
		const compose = readFileSync(join(process.cwd(), 'docker-compose.yml'), 'utf8');
		expect(compose).toMatch(/mailhog:/);
		expect(compose).toContain('mail.smtp2go.com:2525');
	});
});
