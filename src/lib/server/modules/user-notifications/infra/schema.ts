import { pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const userNotificationsSchema = pgSchema('user_notifications');

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
