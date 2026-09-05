import { eq } from 'drizzle-orm';
import type { Database, Transaction } from '../../../db';
import type { UserId } from '../../../shared/ids';
import {
	base32Encode,
	buildOtpAuthUrl,
	newBackupCodes,
	newTotpSecretBytes,
	verifyTotpCode
} from '../domain/totp';
import { adminTotp } from './schema';
import { decryptTotpSecret, encryptTotpSecret } from './totp-secret-crypto';
import { hashPassword, verifyPassword } from './password-hash';

export async function hasAdminTotpEnrollment(db: Database, userId: UserId): Promise<boolean> {
	const rows = await db
		.select({ userId: adminTotp.userId })
		.from(adminTotp)
		.where(eq(adminTotp.userId, userId))
		.limit(1);
	return rows.length > 0;
}

export async function loadAdminTotpSecret(db: Database, userId: UserId): Promise<Buffer | null> {
	const rows = await db
		.select({ secretEncrypted: adminTotp.secretEncrypted })
		.from(adminTotp)
		.where(eq(adminTotp.userId, userId))
		.limit(1);
	const row = rows[0];
	if (!row) return null;
	return decryptTotpSecret(row.secretEncrypted);
}

export type BeginAdminTotpEnrollmentResult = {
	secretBase32: string;
	otpauthUrl: string;
	backupCodes: string[];
};

export function beginAdminTotpEnrollment(email: string): {
	secret: Buffer;
	result: BeginAdminTotpEnrollmentResult;
} {
	const secret = newTotpSecretBytes();
	const secretBase32 = base32Encode(secret);
	const backupCodes = newBackupCodes();
	return {
		secret,
		result: {
			secretBase32,
			otpauthUrl: buildOtpAuthUrl(email, secretBase32),
			backupCodes
		}
	};
}

export async function commitAdminTotpEnrollment(
	db: Database | Transaction,
	input: {
		userId: UserId;
		secret: Buffer;
		backupCodes: string[];
		now: Date;
	}
): Promise<void> {
	const backupCodesHash = await Promise.all(input.backupCodes.map((code) => hashPassword(code)));
	await db
		.insert(adminTotp)
		.values({
			userId: input.userId,
			secretEncrypted: encryptTotpSecret(input.secret),
			enrolledAt: input.now,
			backupCodesHash
		})
		.onConflictDoUpdate({
			target: adminTotp.userId,
			set: {
				secretEncrypted: encryptTotpSecret(input.secret),
				enrolledAt: input.now,
				backupCodesHash
			}
		});
}

export async function verifyAdminTotpOrBackup(
	db: Database,
	userId: UserId,
	code: string,
	now: Date
): Promise<{ kind: 'totp' } | { kind: 'backup'; index: number } | null> {
	const rows = await db
		.select({
			secretEncrypted: adminTotp.secretEncrypted,
			backupCodesHash: adminTotp.backupCodesHash
		})
		.from(adminTotp)
		.where(eq(adminTotp.userId, userId))
		.limit(1);
	const row = rows[0];
	if (!row) return null;

	const secret = decryptTotpSecret(row.secretEncrypted);
	if (verifyTotpCode(secret, code, now)) return { kind: 'totp' };

	const normalized = code.trim().toLowerCase();
	for (let i = 0; i < row.backupCodesHash.length; i++) {
		const hash = row.backupCodesHash[i];
		if (!hash || hash === 'used') continue;
		if (await verifyPassword(normalized, hash)) return { kind: 'backup', index: i };
	}
	return null;
}

export async function consumeAdminBackupCode(
	db: Database | Transaction,
	userId: UserId,
	index: number
): Promise<void> {
	const rows = await db
		.select({ backupCodesHash: adminTotp.backupCodesHash })
		.from(adminTotp)
		.where(eq(adminTotp.userId, userId))
		.limit(1);
	const row = rows[0];
	if (!row) return;
	const next = [...row.backupCodesHash];
	next[index] = 'used';
	await db.update(adminTotp).set({ backupCodesHash: next }).where(eq(adminTotp.userId, userId));
}
