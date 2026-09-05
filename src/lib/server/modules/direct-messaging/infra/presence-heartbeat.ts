import type { Database } from '../../../db';
import type { UserId } from '../../../shared/ids';
import { presence } from './schema';

export async function upsertPresenceHeartbeat(
	db: Database,
	userId: UserId,
	at: Date = new Date()
): Promise<void> {
	await db
		.insert(presence)
		.values({ userId, lastHeartbeatAt: at })
		.onConflictDoUpdate({
			target: presence.userId,
			set: { lastHeartbeatAt: at }
		});
}
