import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, ne, sql } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { MessageId, ThreadId, UserId } from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { getDisplayIdentity } from '../../identity-and-access';
import { getProfileOwnerDisplayName } from '../../provider-profile';
import { toMessageDTO, type MessageDTO } from './serializers';
import { resolveThreadAccess, type ThreadAccess } from './thread-access';
import { messages } from './schema';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;

function clampLimit(limit?: number): number {
	if (!limit || Number.isNaN(limit)) return DEFAULT_LIMIT;
	return Math.min(Math.max(1, limit), MAX_LIMIT);
}

async function senderDisplayName(
	db: Database,
	access: ThreadAccess,
	senderId: UserId
): Promise<string> {
	if (senderId === access.seekerId) {
		const identity = await getDisplayIdentity(db, senderId);
		return identity.isDeleted ? 'Deleted account' : identity.displayName;
	}
	return getProfileOwnerDisplayName(db, access.providerProfileId);
}

export async function listThreadMessages(
	db: Database,
	threadId: ThreadId,
	callerId: UserId,
	options?: { cursor?: string; limit?: number }
): Promise<Result<{ messages: MessageDTO[]; nextCursor: string | null }, UseCaseError>> {
	const access = await resolveThreadAccess(db, threadId, callerId);
	if (!access.ok) return access;

	const limit = clampLimit(options?.limit);
	let cursorSentAt: Date | null = null;
	if (options?.cursor) {
		const cursorRows = await db
			.select({ sentAt: messages.sentAt })
			.from(messages)
			.where(eq(messages.id, options.cursor))
			.limit(1);
		cursorSentAt = cursorRows[0]?.sentAt ?? null;
	}

	const rows = await db
		.select()
		.from(messages)
		.where(
			and(
				eq(messages.threadId, threadId),
				cursorSentAt ? gt(messages.sentAt, cursorSentAt) : sql`true`
			)
		)
		.orderBy(asc(messages.sentAt))
		.limit(limit + 1);

	const page = rows.slice(0, limit);
	const nextCursor = rows.length > limit ? (page[page.length - 1]?.id ?? null) : null;

	const dtos: MessageDTO[] = [];
	for (const row of page) {
		const name = await senderDisplayName(db, access.value, row.senderId as UserId);
		dtos.push(toMessageDTO(row, callerId, name));
	}

	return Ok({ messages: dtos, nextCursor });
}

export type PollResult = {
	messages: MessageDTO[];
	deliveredUpdates: Array<{ messageId: string; deliveredAt: string }>;
	readUpdates: Array<{ messageId: string; readAt: string }>;
	cursor: string | null;
};

export async function pollThreadMessages(
	db: Database,
	threadId: ThreadId,
	callerId: UserId,
	sinceMessageId?: string
): Promise<Result<PollResult, UseCaseError>> {
	const access = await resolveThreadAccess(db, threadId, callerId);
	if (!access.ok) return access;

	const now = new Date();
	let sinceSentAt: Date | null = null;
	if (sinceMessageId) {
		const sinceRows = await db
			.select({ sentAt: messages.sentAt })
			.from(messages)
			.where(eq(messages.id, sinceMessageId))
			.limit(1);
		sinceSentAt = sinceRows[0]?.sentAt ?? null;
	}

	const inboundToDeliver = await db
		.select({ id: messages.id })
		.from(messages)
		.where(
			and(
				eq(messages.threadId, threadId),
				ne(messages.senderId, callerId),
				isNull(messages.deliveredAt),
				sinceSentAt ? gt(messages.sentAt, sinceSentAt) : sql`true`
			)
		);

	if (inboundToDeliver.length > 0) {
		await db
			.update(messages)
			.set({ deliveredAt: now })
			.where(
				inArray(
					messages.id,
					inboundToDeliver.map((row) => row.id)
				)
			);
	}

	const newRows = await db
		.select()
		.from(messages)
		.where(
			and(
				eq(messages.threadId, threadId),
				sinceSentAt ? gt(messages.sentAt, sinceSentAt) : sql`true`
			)
		)
		.orderBy(asc(messages.sentAt));

	const dtos: MessageDTO[] = [];
	for (const row of newRows) {
		const effectiveRow =
			row.senderId !== callerId && !row.deliveredAt
				? { ...row, deliveredAt: now }
				: inboundToDeliver.some((m) => m.id === row.id)
					? { ...row, deliveredAt: now }
					: row;
		const name = await senderDisplayName(db, access.value, effectiveRow.senderId as UserId);
		dtos.push(toMessageDTO(effectiveRow, callerId, name));
	}

	const deliveredUpdates = inboundToDeliver.map((row) => ({
		messageId: row.id,
		deliveredAt: now.toISOString()
	}));

	const outboundReadRows = await db
		.select({ id: messages.id, readAt: messages.readAt })
		.from(messages)
		.where(
			and(
				eq(messages.threadId, threadId),
				eq(messages.senderId, callerId),
				isNotNull(messages.readAt),
				sinceSentAt ? gt(messages.readAt, sinceSentAt) : sql`true`
			)
		);

	const readUpdates = outboundReadRows
		.filter((row) => row.readAt)
		.map((row) => ({
			messageId: row.id,
			readAt: row.readAt!.toISOString()
		}));

	const cursor =
		newRows.length > 0 ? (newRows[newRows.length - 1]?.id ?? null) : (sinceMessageId ?? null);

	return Ok({
		messages: dtos,
		deliveredUpdates,
		readUpdates,
		cursor
	});
}

export async function markMessagesDelivered(
	db: Database,
	threadId: ThreadId,
	recipientId: UserId,
	messageIds: MessageId[],
	now: Date
): Promise<Array<{ messageId: string; senderId: UserId; deliveredAt: string }>> {
	if (messageIds.length === 0) return [];

	const rows = await db
		.select({ id: messages.id, senderId: messages.senderId })
		.from(messages)
		.where(
			and(
				eq(messages.threadId, threadId),
				ne(messages.senderId, recipientId),
				isNull(messages.deliveredAt),
				inArray(messages.id, messageIds)
			)
		);

	if (rows.length === 0) return [];

	await db
		.update(messages)
		.set({ deliveredAt: now })
		.where(
			inArray(
				messages.id,
				rows.map((row) => row.id)
			)
		);

	return rows.map((row) => ({
		messageId: row.id,
		senderId: row.senderId as UserId,
		deliveredAt: now.toISOString()
	}));
}

export async function markThreadReadUpTo(
	db: Database,
	threadId: ThreadId,
	callerId: UserId,
	upToMessageId: MessageId,
	now: Date
): Promise<Result<Array<{ messageId: string; senderId: UserId; readerId: UserId }>, UseCaseError>> {
	const access = await resolveThreadAccess(db, threadId, callerId);
	if (!access.ok) return access;

	const anchorRows = await db
		.select({ sentAt: messages.sentAt })
		.from(messages)
		.where(and(eq(messages.id, upToMessageId), eq(messages.threadId, threadId)))
		.limit(1);
	const anchor = anchorRows[0];
	if (!anchor) return Err({ kind: 'not_found', resource: 'thread' });

	const toMark = await db
		.select({ id: messages.id, senderId: messages.senderId })
		.from(messages)
		.where(
			and(
				eq(messages.threadId, threadId),
				ne(messages.senderId, callerId),
				isNull(messages.readAt),
				lte(messages.sentAt, anchor.sentAt)
			)
		);

	if (toMark.length === 0) return Ok([]);

	await db
		.update(messages)
		.set({ readAt: now })
		.where(
			inArray(
				messages.id,
				toMark.map((row) => row.id)
			)
		);

	return Ok(
		toMark.map((row) => ({
			messageId: row.id,
			senderId: row.senderId as UserId,
			readerId: callerId
		}))
	);
}

export async function getThreadHeader(
	db: Database,
	threadId: ThreadId,
	callerId: UserId
): Promise<
	Result<
		{
			threadId: ThreadId;
			counterpartName: string;
			counterpartUserId: UserId;
			viewerRole: 'seeker' | 'provider';
		},
		UseCaseError
	>
> {
	const access = await resolveThreadAccess(db, threadId, callerId);
	if (!access.ok) return access;

	const counterpartName =
		access.value.viewerRole === 'seeker'
			? await getProfileOwnerDisplayName(db, access.value.providerProfileId)
			: (await getDisplayIdentity(db, access.value.seekerId)).displayName;

	return Ok({
		threadId: access.value.threadId,
		counterpartName,
		counterpartUserId: access.value.counterpartUserId,
		viewerRole: access.value.viewerRole
	});
}
