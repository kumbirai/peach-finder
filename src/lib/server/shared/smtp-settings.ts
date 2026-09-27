export const SMTP2GO_HOST = 'mail.smtp2go.com';
export const SMTP2GO_PORT = 2525;

export type SmtpSettings = {
	host: string;
	port: number;
	secure: boolean;
	user?: string;
	pass?: string;
	from: string;
};

function defaultPort(host: string): number {
	if (host === SMTP2GO_HOST) return SMTP2GO_PORT;
	if (host === '127.0.0.1' || host === 'localhost' || host === 'mailhog') return 1025;
	return 587;
}

export function parseSmtpSettings(
	env: NodeJS.Dict<string> = process.env
): SmtpSettings | null {
	const host = env.SMTP_HOST?.trim();
	if (!host) return null;
	const rawPort = env.SMTP_PORT?.trim();
	const port = rawPort ? Number(rawPort) : defaultPort(host);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error(`Invalid SMTP_PORT "${rawPort}"`);
	}
	const user = env.SMTP_USER?.trim();
	const pass = env.SMTP_PASS?.trim();
	if (host === SMTP2GO_HOST && (!user || !pass)) {
		throw new Error('SMTP2GO requires SMTP_USER and SMTP_PASS');
	}
	return {
		host,
		port,
		secure: env.SMTP_SECURE === 'true',
		user: user || undefined,
		pass: pass || undefined,
		from: env.SMTP_FROM?.trim() || 'Peach Finder <noreply@localhost>'
	};
}
