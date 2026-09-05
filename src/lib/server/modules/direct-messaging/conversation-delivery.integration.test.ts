import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { seedCore, SEED_CORE_PRIMARY_PROFILE_ID } from '../../../../../scripts/seed-core';
import { asId } from '../../shared/ids';
import { sendMessageInThread, sendOrHoldMessage, getThreadForSeekerProvider } from './index';
import {
	markMessagesDelivered,
	markThreadReadUpTo,
	pollThreadMessages
} from './infra/messaging-queries';
import { resolveThreadAccess } from './infra/thread-access';
import { mirrorBlock } from './infra/block-cache';
import { messages } from './infra/schema';
import { eq } from 'drizzle-orm';
import type { Database } from '../../db';
import { users } from '../identity-and-access/infra/schema';

async function seedSeeker(db: Database, id: string, displayName: string): Promise<void> {
	await db
		.insert(users)
		.values({
			id,
			displayName,
			email: `${id}@example.com`,
			emailVerifiedAt: new Date('2026-09-01T10:00:00Z'),
			status: 'active'
		})
		.onConflictDoNothing();
}

describe('US-MSG-02 conversation delivery integration', () => {
	it('poll returns the full message body (not a WS preview cap)', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-00000000a206');
			const providerOwnerId = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
			await seedSeeker(db, seekerId, 'Msg02 Long');
			const providerProfileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const longBody = `Long message ${'x'.repeat(180)}`;
			const now = new Date('2026-09-05T12:00:00Z');

			const sent = await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId,
				body: longBody,
				now,
				correlationId: 'corr-msg02-long'
			});
			if (!sent.ok || sent.value.kind !== 'sent') throw new Error('send failed');

			const polled = await pollThreadMessages(db, sent.value.threadId, providerOwnerId, undefined);
			expect(polled.ok).toBe(true);
			if (!polled.ok) throw new Error('poll failed');
			expect(polled.value.messages[0]?.body).toBe(longBody);
			expect(polled.value.messages[0]?.body.length).toBeGreaterThan(140);
		});
	});

	it('TC-MSG-02b: poll sets delivered_at on inbound messages', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-00000000a201');
			const providerOwnerId = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
			await seedSeeker(db, seekerId, 'Msg02 Seeker');
			const providerProfileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const now = new Date('2026-09-05T12:00:00Z');

			const sent = await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId,
				body: 'Are you free today?',
				now,
				correlationId: 'corr-msg02b'
			});
			expect(sent.ok).toBe(true);
			if (!sent.ok || sent.value.kind !== 'sent') throw new Error('send failed');

			const polled = await pollThreadMessages(db, sent.value.threadId, providerOwnerId, undefined);
			expect(polled.ok).toBe(true);
			if (!polled.ok) throw new Error('poll failed');
			expect(polled.value.deliveredUpdates.length).toBeGreaterThan(0);

			const rows = await db
				.select({ deliveredAt: messages.deliveredAt })
				.from(messages)
				.where(eq(messages.id, sent.value.messageId));
			expect(rows[0]?.deliveredAt).not.toBeNull();
		});
	});

	it('TC-MSG-02b: mark read updates read_at and is idempotent', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-00000000a202');
			const providerOwnerId = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
			await seedSeeker(db, seekerId, 'Msg02 Read');
			const providerProfileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const now = new Date('2026-09-05T12:00:00Z');

			const sent = await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId,
				body: 'Checking availability',
				now,
				correlationId: 'corr-msg02-read'
			});
			if (!sent.ok || sent.value.kind !== 'sent') throw new Error('send failed');

			const read = await markThreadReadUpTo(
				db,
				sent.value.threadId,
				providerOwnerId,
				sent.value.messageId,
				new Date(now.getTime() + 1000)
			);
			expect(read.ok).toBe(true);
			if (!read.ok) throw new Error('read failed');
			expect(read.value).toHaveLength(1);

			const again = await markThreadReadUpTo(
				db,
				sent.value.threadId,
				providerOwnerId,
				sent.value.messageId,
				new Date(now.getTime() + 2000)
			);
			expect(again.ok).toBe(true);
			if (!again.ok) throw new Error('read again failed');
			expect(again.value).toHaveLength(0);
		});
	});

	it('TC-MSG-02c: provider reply path via sendMessageInThread', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-00000000a203');
			await seedSeeker(db, seekerId, 'Msg02 Provider');
			const providerOwnerId = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
			const providerProfileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
			const now = new Date('2026-09-05T12:00:00Z');

			const opened = await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId,
				body: 'Hello',
				now,
				correlationId: 'corr-msg02-provider'
			});
			if (!opened.ok || opened.value.kind !== 'sent') throw new Error('open failed');

			const reply = await sendMessageInThread(db, {
				threadId: opened.value.threadId,
				senderId: providerOwnerId,
				body: 'Hi — I have time at 3pm.',
				now: new Date(now.getTime() + 60_000),
				correlationId: 'corr-msg02-reply'
			});
			expect(reply.ok).toBe(true);

			const thread = await getThreadForSeekerProvider(db, seekerId, providerProfileId);
			expect(thread?.messages).toHaveLength(2);
		});
	});

	it('blocked thread access returns not_found for anti-enumeration', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-00000000a204');
			const providerOwnerId = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
			await seedSeeker(db, seekerId, 'Msg02 Blocked');
			const providerProfileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);

			const sent = await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId,
				body: 'Before block',
				now: new Date('2026-09-05T12:00:00Z'),
				correlationId: 'corr-msg02-block'
			});
			if (!sent.ok || sent.value.kind !== 'sent') throw new Error('send failed');

			await mirrorBlock(db, providerOwnerId, seekerId, new Date());

			const access = await resolveThreadAccess(db, sent.value.threadId, seekerId);
			expect(access.ok).toBe(false);
			if (access.ok) throw new Error('expected blocked');
			expect(access.error.kind).toBe('not_found');
		});
	});

	it('markMessagesDelivered is idempotent for duplicate acks', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const seekerId = asId<'UserId'>('01900000-0000-7000-8000-00000000a205');
			const providerOwnerId = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
			await seedSeeker(db, seekerId, 'Msg02 Deliver');
			const providerProfileId = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);

			const sent = await sendOrHoldMessage(db, {
				seekerId,
				providerProfileId,
				body: 'Deliver me',
				now: new Date('2026-09-05T12:00:00Z'),
				correlationId: 'corr-msg02-deliver'
			});
			if (!sent.ok || sent.value.kind !== 'sent') throw new Error('send failed');

			const first = await markMessagesDelivered(
				db,
				sent.value.threadId,
				providerOwnerId,
				[sent.value.messageId],
				new Date('2026-09-05T12:00:01Z')
			);
			expect(first).toHaveLength(1);

			const second = await markMessagesDelivered(
				db,
				sent.value.threadId,
				providerOwnerId,
				[sent.value.messageId],
				new Date('2026-09-05T12:00:02Z')
			);
			expect(second).toHaveLength(0);
		});
	});
});
