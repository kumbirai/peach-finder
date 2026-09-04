import { and, eq, isNull, asc, desc } from 'drizzle-orm';
import type { Database, Transaction } from '../../../db';
import { publish } from '../../../shared/outbox';
import {
	newId,
	type MessageId,
	type ProviderProfileId,
	type ThreadId,
	type UserId
} from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { asInstant } from '../../../shared/clock';
import type { DomainEvent } from '../../../shared/events';
import { isEmailVerified, getDisplayIdentity } from '../../identity-and-access';
import { getOwnedProfileIdDb, getProfileOwnerDisplayName } from '../../provider-profile';
import { messages, pendingMessages, threads } from './schema';

const MAX_BODY_LENGTH = 4000;

export function validateMessageBody(body: string): string | null {
	const trimmed = body.trim();
	if (!trimmed) return 'Message cannot be empty.';
	if (trimmed.length > MAX_BODY_LENGTH)
		return `Message must be at most ${MAX_BODY_LENGTH} characters.`;
	return null;
}

export type SendOrHoldResult =
	| { kind: 'sent'; threadId: ThreadId; messageId: MessageId }
	| { kind: 'held'; pendingId: string }
	| { kind: 'email_not_verified' };

export async function sendOrHoldMessage(
	db: Database | Transaction,
	input: {
		seekerId: UserId;
		providerProfileId: ProviderProfileId;
		body: string;
		now: Date;
		correlationId: string;
	}
): Promise<Result<SendOrHoldResult, UseCaseError>> {
	const bodyErr = validateMessageBody(input.body);
	if (bodyErr) {
		return Err({ kind: 'validation_failed', issues: [{ path: 'body', message: bodyErr }] });
	}

	const verified = await isEmailVerified(db, input.seekerId);
	if (!verified) {
		const body = input.body.trim();
		const existingPending = await db
			.select({ id: pendingMessages.id })
			.from(pendingMessages)
			.where(
				and(
					eq(pendingMessages.seekerId, input.seekerId),
					eq(pendingMessages.providerProfileId, input.providerProfileId),
					isNull(pendingMessages.releasedAt)
				)
			)
			.limit(1);

		const pendingRow = existingPending[0];
		if (pendingRow) {
			await db.update(pendingMessages).set({ body }).where(eq(pendingMessages.id, pendingRow.id));
			return Ok({ kind: 'held', pendingId: pendingRow.id });
		}

		const pendingId = newId();
		await db.insert(pendingMessages).values({
			id: pendingId,
			seekerId: input.seekerId,
			providerProfileId: input.providerProfileId,
			body
		});
		return Ok({ kind: 'held', pendingId });
	}

	const sent = await sendMessageInTransaction(db, input);
	if (!sent.ok) return sent;
	return Ok({ kind: 'sent', threadId: sent.value.threadId, messageId: sent.value.messageId });
}

async function sendMessageInTransaction(
	db: Database | Transaction,
	input: {
		seekerId: UserId;
		providerProfileId: ProviderProfileId;
		body: string;
		now: Date;
		correlationId: string;
	}
): Promise<Result<{ threadId: ThreadId; messageId: MessageId }, UseCaseError>> {
	const body = input.body.trim();
	let threadId: ThreadId;
	let createdThread = false;

	const existing = await db
		.select({ id: threads.id })
		.from(threads)
		.where(
			and(
				eq(threads.seekerId, input.seekerId),
				eq(threads.providerProfileId, input.providerProfileId)
			)
		)
		.limit(1);

	if (existing[0]) {
		threadId = existing[0].id as ThreadId;
	} else {
		threadId = newId<'ThreadId'>();
		createdThread = true;
	}

	const messageId = newId<'MessageId'>();

	try {
		await db.transaction(async (tx) => {
			if (createdThread) {
				await tx.insert(threads).values({
					id: threadId,
					seekerId: input.seekerId,
					providerProfileId: input.providerProfileId,
					createdAt: input.now,
					lastActivityAt: input.now
				});
				const threadEvent: DomainEvent<
					'ThreadCreated',
					{ threadId: string; seekerId: string; providerProfileId: string }
				> = {
					eventId: newId<'OutboxEventId'>(),
					eventName: 'ThreadCreated',
					version: 1,
					occurredAt: asInstant(input.now.toISOString()),
					correlationId: input.correlationId,
					payload: {
						threadId,
						seekerId: input.seekerId,
						providerProfileId: input.providerProfileId
					}
				};
				await publish(tx, threadEvent);
			} else {
				await tx.update(threads).set({ lastActivityAt: input.now }).where(eq(threads.id, threadId));
			}

			await tx.insert(messages).values({
				id: messageId,
				threadId,
				senderId: input.seekerId,
				body,
				sentAt: input.now
			});

			const msgEvent: DomainEvent<
				'MessageSent',
				{ threadId: string; messageId: string; senderId: string }
			> = {
				eventId: newId<'OutboxEventId'>(),
				eventName: 'MessageSent',
				version: 1,
				occurredAt: asInstant(input.now.toISOString()),
				correlationId: input.correlationId,
				payload: { threadId, messageId, senderId: input.seekerId }
			};
			await publish(tx, msgEvent);
		});
	} catch (error) {
		if (createdThread && String(error).includes('unique')) {
			return sendMessageInTransaction(db, { ...input, correlationId: input.correlationId });
		}
		throw error;
	}

	return Ok({ threadId, messageId });
}

export async function releaseHeldMessagesForUser(
	db: Database | Transaction,
	userId: UserId,
	now: Date,
	correlationId: string
): Promise<number> {
	const held = await db
		.select()
		.from(pendingMessages)
		.where(and(eq(pendingMessages.seekerId, userId), isNull(pendingMessages.releasedAt)));

	let released = 0;
	for (const row of held) {
		const result = await sendMessageInTransaction(db, {
			seekerId: userId,
			providerProfileId: row.providerProfileId as ProviderProfileId,
			body: row.body,
			now,
			correlationId
		});
		if (result.ok) {
			await db
				.update(pendingMessages)
				.set({ releasedAt: now })
				.where(eq(pendingMessages.id, row.id));
			released++;
		}
	}
	return released;
}

export async function getThreadForSeekerProvider(
	db: Database,
	seekerId: UserId,
	providerProfileId: ProviderProfileId
): Promise<{
	threadId: ThreadId;
	messages: Array<{ id: string; body: string; sentAt: Date; senderId: string }>;
} | null> {
	const threadRows = await db
		.select({ id: threads.id })
		.from(threads)
		.where(and(eq(threads.seekerId, seekerId), eq(threads.providerProfileId, providerProfileId)))
		.limit(1);

	const thread = threadRows[0];
	if (!thread) return null;

	const msgRows = await db
		.select({
			id: messages.id,
			body: messages.body,
			sentAt: messages.sentAt,
			senderId: messages.senderId
		})
		.from(messages)
		.where(eq(messages.threadId, thread.id))
		.orderBy(asc(messages.sentAt));

	return {
		threadId: thread.id as ThreadId,
		messages: msgRows
	};
}

export async function getPendingForSeekerProvider(
	db: Database,
	seekerId: UserId,
	providerProfileId: ProviderProfileId
): Promise<{ body: string } | null> {
	const rows = await db
		.select({ body: pendingMessages.body })
		.from(pendingMessages)
		.where(
			and(
				eq(pendingMessages.seekerId, seekerId),
				eq(pendingMessages.providerProfileId, providerProfileId),
				isNull(pendingMessages.releasedAt)
			)
		)
		.limit(1);
	return rows[0] ?? null;
}

export type ThreadSummary = {
	threadId: ThreadId;
	counterpartName: string;
	lastMessagePreview: string;
	lastActivityAt: Date;
};

async function latestMessagePreview(
	db: Database,
	threadId: string
): Promise<{ body: string; sentAt: Date } | null> {
	const rows = await db
		.select({ body: messages.body, sentAt: messages.sentAt })
		.from(messages)
		.where(eq(messages.threadId, threadId))
		.orderBy(desc(messages.sentAt))
		.limit(1);
	return rows[0] ?? null;
}

export async function listSeekerThreads(db: Database, seekerId: UserId): Promise<ThreadSummary[]> {
	const threadRows = await db
		.select({
			id: threads.id,
			providerProfileId: threads.providerProfileId,
			lastActivityAt: threads.lastActivityAt
		})
		.from(threads)
		.where(eq(threads.seekerId, seekerId))
		.orderBy(desc(threads.lastActivityAt));

	const summaries: ThreadSummary[] = [];
	for (const row of threadRows) {
		const preview = await latestMessagePreview(db, row.id);
		const name = await getProfileOwnerDisplayName(db, row.providerProfileId as ProviderProfileId);
		summaries.push({
			threadId: row.id as ThreadId,
			counterpartName: name,
			lastMessagePreview: preview?.body ?? '',
			lastActivityAt: row.lastActivityAt
		});
	}
	return summaries;
}

export async function listProviderInbox(db: Database, ownerId: UserId): Promise<ThreadSummary[]> {
	const profileId = await getOwnedProfileIdDb(db, ownerId);
	if (!profileId) return [];

	const threadRows = await db
		.select({
			id: threads.id,
			seekerId: threads.seekerId,
			lastActivityAt: threads.lastActivityAt
		})
		.from(threads)
		.where(eq(threads.providerProfileId, profileId))
		.orderBy(desc(threads.lastActivityAt));

	const summaries: ThreadSummary[] = [];
	for (const row of threadRows) {
		const preview = await latestMessagePreview(db, row.id);
		const seeker = await getDisplayIdentity(db, row.seekerId as UserId);
		summaries.push({
			threadId: row.id as ThreadId,
			counterpartName: seeker.isDeleted ? 'Deleted account' : seeker.displayName,
			lastMessagePreview: preview?.body ?? '',
			lastActivityAt: row.lastActivityAt
		});
	}
	return summaries;
}

export async function markDeletedSenderAccountForUser(
	tx: Transaction,
	userId: UserId
): Promise<void> {
	await tx
		.update(messages)
		.set({ isDeletedSenderAccount: true })
		.where(eq(messages.senderId, userId));
}
