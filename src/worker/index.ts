import PgBoss from 'pg-boss';
import { databaseUrl } from '../lib/server/env';
import { getDb } from '../lib/server/db';
import { bootApp, tickConfigRefresh } from '../lib/server/boot';
import { deadLetter } from '../lib/server/shared/outbox';
import { cleanupRateLimitBuckets } from '../lib/server/shared/rate-limit';
import { handleConfigChanged } from '../lib/server/modules/platform-configuration';
import {
	handleEmailVerified,
	handleAccountDeletionRequested
} from '../lib/server/modules/direct-messaging';
import { anonymizePendingUsers } from '../lib/server/modules/identity-and-access';
import { log } from '../lib/server/shared/logger';
import { dispatchUndispatched, type OutboxJob } from './dispatch';

const QUEUE = 'outbox-subscriber';
const MAX_ATTEMPTS = 5;

async function handleJob(job: { data: OutboxJob; retrycount?: number }): Promise<void> {
	const { event, subscriber } = job.data;
	const db = getDb();
	try {
		if (
			subscriber === 'platform-configuration.config-cache' &&
			event.eventName === 'ConfigChanged'
		) {
			const payload = event.payload as { configKey: string };
			await handleConfigChanged(payload, db);
		}
		if (subscriber === 'direct-messaging.release-held' && event.eventName === 'EmailVerified') {
			await handleEmailVerified(db, event as never);
		}
		if (
			subscriber === 'direct-messaging.mark-deleted-account' &&
			event.eventName === 'AccountDeletionRequested'
		) {
			await handleAccountDeletionRequested(db, event as never);
		}
	} catch (error) {
		const reason = error instanceof Error ? error.message : 'unknown';
		if ((job.retrycount ?? 0) >= MAX_ATTEMPTS - 1) {
			await deadLetter(
				db,
				{
					eventId: event.eventId,
					eventName: event.eventName,
					version: 1,
					occurredAt: new Date(event.occurredAt),
					correlationId: event.correlationId,
					payload: event.payload,
					publishedAt: new Date(event.occurredAt),
					attemptCount: MAX_ATTEMPTS
				},
				subscriber,
				reason
			);
		}
		throw error;
	}
}

const boss = new PgBoss({ connectionString: databaseUrl() });
await boss.start();
await boss.createQueue(QUEUE);
await boss.work(QUEUE, async (jobs) => {
	const list = Array.isArray(jobs) ? jobs : [jobs];
	for (const job of list) {
		await handleJob(job as never);
	}
});

await bootApp();

setInterval(() => {
	void (async () => {
		const db = getDb();
		await dispatchUndispatched(db, async (payload) => {
			await boss.send(QUEUE, payload, { retryLimit: MAX_ATTEMPTS - 1 });
		});
		await cleanupRateLimitBuckets(db, new Date());
		await anonymizePendingUsers(db, new Date());
		await tickConfigRefresh();
	})().catch((error: unknown) => {
		log('error', 'worker tick failed', {
			err: error instanceof Error ? error.message : 'unknown'
		});
	});
}, 15_000).unref();

log('info', 'worker started');
