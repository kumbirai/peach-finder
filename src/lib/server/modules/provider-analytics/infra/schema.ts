import { integer, jsonb, pgSchema, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const providerAnalyticsSchema = pgSchema('provider_analytics');

export const rawEvents = providerAnalyticsSchema.table('raw_event', {
	id: uuid('id').primaryKey(),
	eventType: text('event_type').notNull(),
	providerProfileId: uuid('provider_profile_id'),
	viewerKey: text('viewer_key'),
	occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
	metadata: jsonb('metadata').notNull().default({})
});

export const hourlyRollups = providerAnalyticsSchema.table('hourly_rollup', {
	providerProfileId: uuid('provider_profile_id').notNull(),
	hourBucket: timestamp('hour_bucket', { withTimezone: true, mode: 'date' }).notNull(),
	profileViews: integer('profile_views').notNull().default(0),
	searchAppearances: integer('search_appearances').notNull().default(0),
	contactRequests: integer('contact_requests').notNull().default(0)
});

export const dashboardMetricCache = providerAnalyticsSchema.table('dashboard_metric_cache', {
	providerProfileId: uuid('provider_profile_id').notNull(),
	rangeDays: smallint('range_days').notNull(),
	computedAt: timestamp('computed_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
	payload: jsonb('payload').notNull()
});
