import { and, eq } from 'drizzle-orm';
import type { Transaction } from '../../../db';
import type { UserId } from '../../../shared/ids';
import { revokeAllSessionsForUser } from './session-commands';
import { users } from './schema';

export async function applySuspension(tx: Transaction, userId: UserId, now: Date): Promise<void> {
	await tx
		.update(users)
		.set({ status: 'suspended', updatedAt: now })
		.where(and(eq(users.id, userId), eq(users.status, 'active')));
	await revokeAllSessionsForUser(tx, userId, now);
}

export async function applyReinstatement(
	tx: Transaction,
	userId: UserId,
	now: Date
): Promise<void> {
	await tx
		.update(users)
		.set({ status: 'active', updatedAt: now })
		.where(and(eq(users.id, userId), eq(users.status, 'suspended')));
}
