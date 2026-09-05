import { and, eq, gte } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { UserId } from '../../../shared/ids';
import { sessions } from './schema';

export async function hasSignedInSince(
	db: Database,
	userId: UserId,
	since: Date
): Promise<boolean> {
	const rows = await db
		.select({ id: sessions.id })
		.from(sessions)
		.where(and(eq(sessions.userId, userId), gte(sessions.lastSeenAt, since)))
		.limit(1);
	return rows.length > 0;
}
