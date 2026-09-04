import { and, eq, isNull, lte } from 'drizzle-orm';
import type { Database, Transaction } from '../../../db';
import { publish } from '../../../shared/outbox';
import { newId, type SessionId, type UserId } from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { asInstant } from '../../../shared/clock';
import type { DomainEvent } from '../../../shared/events';
import { assertCanSelfDelete, IllegalAccountTransitionError } from '../domain/account-status';
import { buildAnonymizedUserFields } from '../domain/anonymize-user';
import { verifyPassword } from './password-hash';
import { emailVerificationTokens, oauthLinks, passwordResetTokens, users } from './schema';
import { revokeAllSessionsForUser } from './session-commands';
import { unpublishProfileForOwner } from '../../provider-profile';
import { cancelListingForOwner } from '../../listing-billing';

const ANONYMIZATION_MAX_AGE_MS = 30 * 24 * 60 * 60_000;

export type DeleteAccountInput = {
	userId: UserId;
	sessionId: SessionId;
	password: string;
	confirm: true;
};

export async function deleteAccount(
	db: Database,
	input: DeleteAccountInput,
	now: Date,
	correlationId: string
): Promise<Result<{ deletionScheduled: true }, UseCaseError>> {
	if (input.confirm !== true) {
		return Err({
			kind: 'validation_failed',
			issues: [{ path: 'confirm', message: 'You must confirm account deletion.' }]
		});
	}

	const rows = await db
		.select({
			passwordHash: users.passwordHash,
			status: users.status
		})
		.from(users)
		.where(eq(users.id, input.userId))
		.limit(1);

	const row = rows[0];
	if (!row) {
		return Err({ kind: 'not_found', resource: 'user' });
	}

	try {
		assertCanSelfDelete(row.status as 'active' | 'suspended' | 'deleted');
	} catch (error) {
		if (error instanceof IllegalAccountTransitionError) {
			return Err({ kind: 'forbidden', reason: 'account already deleted' });
		}
		throw error;
	}

	if (!row.passwordHash) {
		return Err({
			kind: 'forbidden',
			reason: 'password required to delete account'
		});
	}

	const valid = await verifyPassword(input.password, row.passwordHash);
	if (!valid) {
		return Err({ kind: 'forbidden', reason: 'invalid password' });
	}

	let transitioned = false;
	await db.transaction(async (tx) => {
		const updated = await tx
			.update(users)
			.set({
				status: 'deleted',
				deletedAt: now,
				updatedAt: now
			})
			.where(and(eq(users.id, input.userId), eq(users.status, row.status)))
			.returning({ id: users.id });

		if (updated.length === 0) return;

		transitioned = true;

		await revokeAllSessionsForUser(tx, input.userId, now);
		await tx.delete(oauthLinks).where(eq(oauthLinks.userId, input.userId));
		await tx
			.delete(emailVerificationTokens)
			.where(eq(emailVerificationTokens.userId, input.userId));
		await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, input.userId));

		await unpublishProfileForOwner(tx, input.userId, 'owner', correlationId, now);
		await cancelListingForOwner(tx, input.userId, now);

		const event: DomainEvent<'AccountDeletionRequested', { userId: string }> = {
			eventId: newId<'OutboxEventId'>(),
			eventName: 'AccountDeletionRequested',
			version: 1,
			occurredAt: asInstant(now.toISOString()),
			correlationId,
			payload: { userId: input.userId }
		};
		await publish(tx, event);
	});

	if (!transitioned) {
		return Err({ kind: 'forbidden', reason: 'account already deleted' });
	}

	return Ok({ deletionScheduled: true });
}

export async function anonymizePendingUsers(db: Database, now: Date): Promise<number> {
	const cutoff = new Date(now.getTime() - ANONYMIZATION_MAX_AGE_MS);
	const pending = await db
		.select({ id: users.id })
		.from(users)
		.where(
			and(eq(users.status, 'deleted'), isNull(users.anonymizedAt), lte(users.deletedAt, cutoff))
		);

	let count = 0;
	for (const row of pending) {
		const fields = buildAnonymizedUserFields(now);
		const updated = await db
			.update(users)
			.set({
				...fields,
				updatedAt: now
			})
			.where(and(eq(users.id, row.id), eq(users.status, 'deleted'), isNull(users.anonymizedAt)))
			.returning({ id: users.id });
		if (updated.length > 0) count += 1;
	}
	return count;
}

/** Test helper: run phase-2 anonymization immediately for one user. */
export async function anonymizeUserNow(
	tx: Transaction,
	userId: UserId,
	now: Date
): Promise<boolean> {
	const fields = buildAnonymizedUserFields(now);
	const updated = await tx
		.update(users)
		.set({
			...fields,
			updatedAt: now
		})
		.where(and(eq(users.id, userId), eq(users.status, 'deleted'), isNull(users.anonymizedAt)))
		.returning({ id: users.id });
	return updated.length > 0;
}
