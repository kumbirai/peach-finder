import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const STEP_SECONDS = 30;
const WINDOW = 1;

export function newTotpSecretBytes(): Buffer {
	return randomBytes(20);
}

export function base32Encode(data: Buffer): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
	let bits = 0;
	let value = 0;
	let output = '';

	for (const byte of data) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			output += alphabet[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}

	if (bits > 0) {
		output += alphabet[(value << (5 - bits)) & 31];
	}

	return output;
}

export function buildOtpAuthUrl(email: string, secretBase32: string): string {
	const label = encodeURIComponent(`PeachFinder:${email}`);
	const issuer = encodeURIComponent('PeachFinder');
	return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${issuer}`;
}

export function generateTotpCode(secret: Buffer, instant: Date, digits = 6): string {
	const counter = Math.floor(instant.getTime() / 1000 / STEP_SECONDS);
	const counterBuffer = Buffer.alloc(8);
	counterBuffer.writeBigUInt64BE(BigInt(counter));

	const digest = createHmac('sha1', secret).update(counterBuffer).digest();
	const offset = digest[digest.length - 1]! & 0x0f;
	const binary =
		((digest[offset]! & 0x7f) << 24) |
		((digest[offset + 1]! & 0xff) << 16) |
		((digest[offset + 2]! & 0xff) << 8) |
		(digest[offset + 3]! & 0xff);
	const mod = 10 ** digits;
	return String(binary % mod).padStart(digits, '0');
}

export function verifyTotpCode(secret: Buffer, code: string, instant: Date): boolean {
	const normalized = code.replace(/\s+/g, '');
	if (!/^\d{6}$/.test(normalized)) return false;

	for (let drift = -WINDOW; drift <= WINDOW; drift++) {
		const at = new Date(instant.getTime() + drift * STEP_SECONDS * 1000);
		const expected = generateTotpCode(secret, at);
		const a = Buffer.from(expected);
		const b = Buffer.from(normalized);
		if (a.length === b.length && timingSafeEqual(a, b)) return true;
	}
	return false;
}

export function newBackupCodes(count = 10): string[] {
	const codes: string[] = [];
	for (let i = 0; i < count; i++) {
		codes.push(randomBytes(5).toString('hex'));
	}
	return codes;
}
