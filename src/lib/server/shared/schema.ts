import {
	index,
	integer,
	jsonb,
	pgSchema,
	primaryKey,
	smallint,
	text,
	timestamp,
	unique,
	uuid
} from 'drizzle-orm/pg-core';

export const sharedSchema = pgSchema('shared');

export const outbox = sharedSchema.table(
	'outbox',
	{
		eventId: uuid('event_id').primaryKey(),
		eventName: text('event_name').notNull(),
		version: smallint('version').notNull().default(1),
		occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull(),
		correlationId: text('correlation_id').notNull(),
		payload: jsonb('payload').notNull(),
		publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),
		dispatchedAt: timestamp('dispatched_at', { withTimezone: true, mode: 'date' }),
		attemptCount: integer('attempt_count').notNull().default(0)
	},
	(table) => [index('outbox_undispatched_idx').on(table.publishedAt)]
);

export const outboxDeadLetter = sharedSchema.table('outbox_dead_letter', {
	eventId: uuid('event_id').notNull(),
	eventName: text('event_name').notNull(),
	version: smallint('version').notNull().default(1),
	occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull(),
	correlationId: text('correlation_id').notNull(),
	payload: jsonb('payload').notNull(),
	publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }).notNull(),
	subscriber: text('subscriber').notNull(),
	failedReason: text('failed_reason').notNull(),
	deadLetteredAt: timestamp('dead_lettered_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.defaultNow()
});

export const processedEvents = sharedSchema.table(
	'processed_events',
	{
		eventId: uuid('event_id').notNull(),
		subscriber: text('subscriber').notNull(),
		processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
	},
	(table) => [primaryKey({ columns: [table.eventId, table.subscriber] })]
);

export const auditLog = sharedSchema.table(
	'audit_log',
	{
		id: uuid('id').primaryKey(),
		occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),
		actorId: uuid('actor_id'),
		actorRole: text('actor_role').notNull(),
		action: text('action').notNull(),
		targetType: text('target_type').notNull(),
		targetId: uuid('target_id').notNull(),
		reason: text('reason'),
		metadata: jsonb('metadata').notNull().default({}),
		correlationId: text('correlation_id').notNull()
	},
	(table) => [
		index('audit_log_target_idx').on(table.targetType, table.targetId),
		index('audit_log_actor_idx').on(table.actorId)
	]
);

export const rateLimitBucket = sharedSchema.table(
	'rate_limit_bucket',
	{
		bucketKey: text('bucket_key').notNull(),
		windowStart: timestamp('window_start', { withTimezone: true, mode: 'date' }).notNull(),
		count: integer('count').notNull().default(1)
	},
	(table) => [primaryKey({ columns: [table.bucketKey, table.windowStart] })]
);

export const idempotencyLedger = sharedSchema.table(
	'idempotency_ledger',
	{
		key: text('key').primaryKey(),
		status: integer('status').notNull(),
		body: jsonb('body').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(table) => [unique('idempotency_ledger_key_uq').on(table.key)]
);

export type AuditActorRole = 'admin' | 'provider' | 'seeker' | 'system';
