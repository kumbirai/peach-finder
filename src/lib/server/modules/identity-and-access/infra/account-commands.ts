import { eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { UserId } from '../../../shared/ids';
import { validateDisplayName } from '../domain/password-policy';
import { users } from './schema';
import { newId } from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { asInstant } from '../../../shared/clock';
import type { DomainEvent } from '../../../shared/events';
import { publish } from '../../../shared/outbox';

export async function updateDisplayName(
	db: Database,
	userId: UserId,
	displayName: string,
	correlationId: string,
	now: Date
): Promise<
	Result<
		{
			displayName: string;
			identityEvent?: DomainEvent<
				'IdentityAttributesChanged',
				{ userId: string; changedFields: string[] }
			>;
		},
		UseCaseError
	>
> {
	const nameErr = validateDisplayName(displayName);
	if (nameErr) {
		return Err({
			kind: 'validation_failed',
			issues: [{ path: 'displayName', message: nameErr }]
		});
	}

	const trimmed = displayName.trim();
	const rows = await db
		.select({ displayName: users.displayName })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	const current = rows[0];
	if (!current) return Err({ kind: 'not_found', resource: 'user' });
	if (current.displayName === trimmed) {
		return Ok({ displayName: trimmed });
	}

	let identityEvent:
		| DomainEvent<'IdentityAttributesChanged', { userId: string; changedFields: string[] }>
		| undefined;

	await db.transaction(async (tx) => {
		await tx
			.update(users)
			.set({ displayName: trimmed, updatedAt: now })
			.where(eq(users.id, userId));

		identityEvent = {
			eventId: newId<'OutboxEventId'>(),
			eventName: 'IdentityAttributesChanged',
			version: 1,
			occurredAt: asInstant(now.toISOString()),
			correlationId,
			payload: { userId, changedFields: ['display_name'] }
		};
		await publish(tx, identityEvent);
	});

	return Ok(identityEvent ? { displayName: trimmed, identityEvent } : { displayName: trimmed });
}
