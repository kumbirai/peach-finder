import { createHmac } from 'node:crypto';

function phonePepper(): string {
	const pepper = process.env.PHONE_PEPPER;
	if (pepper) return pepper;
	if (process.env.NODE_ENV === 'production') {
		throw new Error('PHONE_PEPPER must be set in production');
	}
	return 'dev-phone-pepper-not-for-production';
}

export function hashPhone(phone: string): string {
	return createHmac('sha256', phonePepper()).update(phone).digest('hex');
}
