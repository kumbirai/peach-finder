import { boolean, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { pgSchema } from 'drizzle-orm/pg-core';

export const trustAndSafetySchema = pgSchema('trust_and_safety');

/** Legacy display table — superseded by badge_state for identity badge logic. */
export const providerBadges = trustAndSafetySchema.table(
	'provider_badge',
	{
		providerProfileId: uuid('provider_profile_id').notNull(),
		badge: text('badge').notNull(),
		grantedAt: timestamp('granted_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(table) => [{ pk: { columns: [table.providerProfileId, table.badge] } }]
);

export const badgeState = trustAndSafetySchema.table('badge_state', {
	providerProfileId: uuid('provider_profile_id').primaryKey(),
	identityVerified: boolean('identity_verified').notNull().default(false),
	identityVerifiedSince: timestamp('identity_verified_since', {
		withTimezone: true,
		mode: 'date'
	}),
	suppressed: boolean('suppressed').notNull().default(false),
	suppressedReason: text('suppressed_reason'),
	activeThisWeek: boolean('active_this_week').notNull().default(false),
	activeThisWeekSince: timestamp('active_this_week_since', {
		withTimezone: true,
		mode: 'date'
	}),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
});

export const blocks = trustAndSafetySchema.table(
	'block',
	{
		blockerId: uuid('blocker_id').notNull(),
		blockedId: uuid('blocked_id').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(table) => [{ pk: { columns: [table.blockerId, table.blockedId] } }]
);

export const reports = trustAndSafetySchema.table('report', {
	id: uuid('id').primaryKey(),
	reporterId: uuid('reporter_id').notNull(),
	targetType: text('target_type').notNull(),
	targetId: uuid('target_id').notNull(),
	reason: text('reason').notNull(),
	freeText: text('free_text'),
	status: text('status').notNull().default('open'),
	resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
	resolvedBy: uuid('resolved_by'),
	resolutionNote: text('resolution_note'),
	metadata: jsonb('metadata').notNull().default({}),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
});

export const verificationCases = trustAndSafetySchema.table('verification_case', {
	id: uuid('id').primaryKey(),
	providerProfileId: uuid('provider_profile_id').notNull(),
	status: text('status').notNull().default('pending'),
	docPhotoIds: uuid('doc_photo_ids').array().notNull().default([]),
	submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.defaultNow(),
	decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
	decidedBy: uuid('decided_by'),
	decisionReason: text('decision_reason'),
	docsPurgedAt: timestamp('docs_purged_at', { withTimezone: true, mode: 'date' })
});

export const processedAdminActions = trustAndSafetySchema.table('processed_admin_action', {
	idempotencyKey: text('idempotency_key').primaryKey(),
	resultRef: uuid('result_ref').notNull(),
	processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.defaultNow()
});

export const moderationActions = trustAndSafetySchema.table('moderation_action', {
	id: uuid('id').primaryKey(),
	adminId: uuid('admin_id').notNull(),
	action: text('action').notNull(),
	targetType: text('target_type').notNull(),
	targetId: uuid('target_id').notNull(),
	reason: text('reason').notNull(),
	reportId: uuid('report_id'),
	metadata: jsonb('metadata').notNull().default({}),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
});
