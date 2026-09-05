import { eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import { asId, type SessionId, type UserId } from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { verifyPassword } from './password-hash';
import { users } from './schema';
import { storeDevAdminEnrollment } from './dev-verification';
import {
	beginAdminTotpEnrollment,
	commitAdminTotpEnrollment,
	hasAdminTotpEnrollment,
	verifyAdminTotpOrBackup,
	consumeAdminBackupCode,
	type BeginAdminTotpEnrollmentResult
} from './admin-totp-commands';
import { verifyTotpCode } from '../domain/totp';
import { createAdminSession } from './session-commands';

export type VerifyAdminPasswordResult = {
	userId: UserId;
	email: string;
	needsEnrollment: boolean;
	enrollment?: BeginAdminTotpEnrollmentResult & { secret: Buffer };
};

export async function verifyAdminPassword(
	db: Database,
	input: { email: string; password: string }
): Promise<Result<VerifyAdminPasswordResult, UseCaseError>> {
	const normalizedEmail = input.email.trim().toLowerCase();
	const rows = await db
		.select({
			id: users.id,
			passwordHash: users.passwordHash,
			status: users.status,
			isAdmin: users.isAdmin,
			email: users.email
		})
		.from(users)
		.where(eq(users.email, normalizedEmail))
		.limit(1);

	const row = rows[0];
	if (!row?.passwordHash || !row.isAdmin) {
		await verifyPassword(input.password, '$argon2id$v=19$m=19456,t=2,p=1$fake$fake');
		return Err({ kind: 'forbidden', reason: 'invalid email or password' });
	}

	if (row.status !== 'active') {
		await verifyPassword(input.password, row.passwordHash);
		return Err({ kind: 'forbidden', reason: 'invalid email or password' });
	}

	const valid = await verifyPassword(input.password, row.passwordHash);
	if (!valid) {
		return Err({ kind: 'forbidden', reason: 'invalid email or password' });
	}

	const userId = asId<'UserId'>(row.id);
	const enrolled = await hasAdminTotpEnrollment(db, userId);
	if (!enrolled) {
		const started = beginAdminTotpEnrollment(normalizedEmail);
		storeDevAdminEnrollment(userId, {
			secret: started.secret,
			backupCodes: started.result.backupCodes
		});
		return Ok({
			userId,
			email: normalizedEmail,
			needsEnrollment: true,
			enrollment: { ...started.result, secret: started.secret }
		});
	}

	return Ok({
		userId,
		email: normalizedEmail,
		needsEnrollment: false
	});
}

export async function completeAdminLogin(
	db: Database,
	input: {
		userId: UserId;
		code: string;
		enrollment?: { secret: Buffer; backupCodes: string[] };
		ipAddress: string;
		userAgent: string | null;
		now: Date;
	}
): Promise<
	Result<{ userId: UserId; sessionId: SessionId; token: string; enrolled: boolean }, UseCaseError>
> {
	const enrolled = await hasAdminTotpEnrollment(db, input.userId);

	if (!enrolled) {
		if (!input.enrollment) {
			return Err({ kind: 'forbidden', reason: 'TOTP enrollment required' });
		}
		if (!verifyTotpCode(input.enrollment.secret, input.code, input.now)) {
			return Err({ kind: 'forbidden', reason: 'invalid totp code' });
		}
		await db.transaction(async (tx) => {
			await commitAdminTotpEnrollment(tx, {
				userId: input.userId,
				secret: input.enrollment!.secret,
				backupCodes: input.enrollment!.backupCodes,
				now: input.now
			});
		});
	} else {
		const verified = await verifyAdminTotpOrBackup(db, input.userId, input.code, input.now);
		if (!verified) {
			return Err({ kind: 'forbidden', reason: 'invalid totp code' });
		}
		if (verified.kind === 'backup') {
			await consumeAdminBackupCode(db, input.userId, verified.index);
		}
	}

	const session = await createAdminSession(db, {
		userId: input.userId,
		ipAddress: input.ipAddress,
		userAgent: input.userAgent,
		now: input.now
	});

	return Ok({
		userId: input.userId,
		sessionId: session.sessionId,
		token: session.token,
		enrolled: !enrolled
	});
}
