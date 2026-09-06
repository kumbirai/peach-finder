import {
	pgSchema,
	text,
	timestamp,
	uuid,
	integer,
	boolean,
	primaryKey,
	index
} from 'drizzle-orm/pg-core';

export const userNotificationsSchema = pgSchema('user_notifications');

export const notificationPreference = userNotificationsSchema.table(
	'notification_preference',
	{
		userId: uuid('user_id').notNull(),
		category: text('category').notNull(),
		channel: text('channel').notNull(),
		enabled: boolean('enabled').notNull().default(true)
	},
	(table) => [primaryKey({ columns: [table.userId, table.category, table.channel] })]
);

export const notificationLog = userNotificationsSchema.table('notification_log', {
	id: uuid('id').primaryKey(),
	userId: uuid('user_id').notNull(),
	category: text('category').notNull(),
	channel: text('channel').notNull(),
	status: text('status').notNull(),
	title: text('title'),
	body: text('body'),
	deepLinkPath: text('deep_link_path'),
	relatedEntityType: text('related_entity_type'),
	relatedEntityId: uuid('related_entity_id'),
	readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
	dispatchedAt: timestamp('dispatched_at', { withTimezone: true, mode: 'date' }),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
	correlationId: text('correlation_id').notNull()
});

export const notificationBatchWindow = userNotificationsSchema.table(
	'notification_batch_window',
	{
		userId: uuid('user_id').notNull(),
		category: text('category').notNull(),
		sourceKey: text('source_key').notNull(),
		openedAt: timestamp('opened_at', { withTimezone: true, mode: 'date' }).notNull(),
		flushAfter: timestamp('flush_after', { withTimezone: true, mode: 'date' }).notNull(),
		messageCount: integer('message_count').notNull().default(1),
		lastMessageId: uuid('last_message_id'),
		inAppNotificationId: uuid('in_app_notification_id'),
		status: text('status').notNull().default('open')
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.category, table.sourceKey] }),
		index('batch_window_flush_idx').on(table.flushAfter)
	]
);

export const notifBlockCache = userNotificationsSchema.table(
	'block_cache',
	{
		blockerId: uuid('blocker_id').notNull(),
		blockedId: uuid('blocked_id').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull()
	},
	(table) => [
		primaryKey({ columns: [table.blockerId, table.blockedId] }),
		index('notif_block_blocked_idx').on(table.blockedId)
	]
);
