import { eq } from 'drizzle-orm';
import type { Transaction } from '../../../db';
import type { UserId } from '../../../shared/ids';
import { processedAdminActions } from './schema';

export function buildAdminIdempotencyKey(
	actorId: UserId,
	action: string,
	targetId: string,
	headerKey: string | null
): string {
	const nonce = headerKey?.trim() || crypto.randomUUID();
	return `${actorId}:${action}:${targetId}:${nonce}`;
}

export async function readProcessedAdminAction(
	tx: Transaction,
	idempotencyKey: string
): Promise<{ resultRef: string } | null> {
	const rows = await tx
		.select({ resultRef: processedAdminActions.resultRef })
		.from(processedAdminActions)
		.where(eq(processedAdminActions.idempotencyKey, idempotencyKey))
		.limit(1);
	const row = rows[0];
	return row ? { resultRef: row.resultRef } : null;
}

export async function recordProcessedAdminAction(
	tx: Transaction,
	idempotencyKey: string,
	resultRef: string,
	now: Date
): Promise<void> {
	await tx.insert(processedAdminActions).values({
		idempotencyKey,
		resultRef,
		processedAt: now
	});
}
