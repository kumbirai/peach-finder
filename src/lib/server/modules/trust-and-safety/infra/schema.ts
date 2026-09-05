import { boolean, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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

export const verificationCases = trustAndSafetySchema.table('verification_case', {
	id: uuid('id').primaryKey(),
	providerProfileId: uuid('provider_profile_id').notNull(),
	status: text('status').notNull().default('pending'),
	submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.defaultNow(),
	decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
	decidedBy: uuid('decided_by'),
	decisionReason: text('decision_reason')
});
