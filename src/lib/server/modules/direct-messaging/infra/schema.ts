import { boolean, index, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const directMessagingSchema = pgSchema('direct_messaging');

export const threads = directMessagingSchema.table(
	'thread',
	{
		id: uuid('id').primaryKey(),
		seekerId: uuid('seeker_id').notNull(),
		providerProfileId: uuid('provider_profile_id').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
		lastActivityAt: timestamp('last_activity_at', { withTimezone: true, mode: 'date' }).notNull()
	},
	(table) => [
		uniqueIndex('thread_seeker_provider_uq').on(table.seekerId, table.providerProfileId),
		index('thread_seeker_activity_idx').on(table.seekerId, table.lastActivityAt),
		index('thread_provider_activity_idx').on(table.providerProfileId, table.lastActivityAt)
	]
);

export const messages = directMessagingSchema.table(
	'message',
	{
		id: uuid('id').primaryKey(),
		threadId: uuid('thread_id')
			.notNull()
			.references(() => threads.id),
		senderId: uuid('sender_id').notNull(),
		body: text('body').notNull(),
		sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }).notNull(),
		deliveredAt: timestamp('delivered_at', { withTimezone: true, mode: 'date' }),
		readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
		isDeletedSenderAccount: boolean('is_deleted_sender_account').notNull().default(false)
	},
	(table) => [
		index('message_thread_sent_idx').on(table.threadId, table.sentAt),
		index('message_unread_idx').on(table.threadId)
	]
);

export const pendingMessages = directMessagingSchema.table(
	'pending_message',
	{
		id: uuid('id').primaryKey(),
		seekerId: uuid('seeker_id').notNull(),
		providerProfileId: uuid('provider_profile_id').notNull(),
		body: text('body').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
		releasedAt: timestamp('released_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [index('pending_message_seeker_idx').on(table.seekerId)]
);

export const presence = directMessagingSchema.table('presence', {
	userId: uuid('user_id').primaryKey(),
	lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true, mode: 'date' }).notNull()
});
