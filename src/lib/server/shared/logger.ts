const EMAIL_RE = /^(.).*(@.*)$/;

export function maskEmail(email: string): string {
	const match = EMAIL_RE.exec(email);
	if (!match?.[1] || !match[2]) return '***';
	return `${match[1]}***${match[2]}`;
}

export function maskPhone(phone: string): string {
	if (phone.length <= 4) return '***';
	return `***${phone.slice(-4)}`;
}

export type LogFields = Record<string, string | number | boolean | null>;

export function log(
	level: 'info' | 'warn' | 'error',
	message: string,
	fields: LogFields = {}
): void {
	const line = JSON.stringify({
		level,
		message,
		ts: new Date().toISOString(),
		...fields
	});
	if (level === 'error') {
		console.error(line);
	} else if (level === 'warn') {
		console.warn(line);
	} else {
		console.info(line);
	}
}
