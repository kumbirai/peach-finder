import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function encryptionKey(): Buffer {
	const raw = process.env.TOTP_ENCRYPTION_KEY;
	const material = raw
		? Buffer.from(raw, 'base64')
		: Buffer.from('dev-totp-key-32bytes-not-prod!!', 'utf8');
	if (process.env.NODE_ENV === 'production' && !raw) {
		throw new Error('TOTP_ENCRYPTION_KEY must be set in production');
	}
	return createHash('sha256').update(material).digest();
}

export function encryptTotpSecret(secret: Buffer): Buffer {
	const key = encryptionKey();
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	const encrypted = Buffer.concat([cipher.update(secret), cipher.final()]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([iv, tag, encrypted]);
}

export function decryptTotpSecret(payload: Buffer): Buffer {
	const key = encryptionKey();
	const iv = payload.subarray(0, 12);
	const tag = payload.subarray(12, 28);
	const encrypted = payload.subarray(28);
	const decipher = createDecipheriv('aes-256-gcm', key, iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}
