import { index, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { pgSchema } from 'drizzle-orm/pg-core';

export const listingBillingSchema = pgSchema('listing_billing');

export const listings = listingBillingSchema.table(
	'listing',
	{
		providerProfileId: uuid('provider_profile_id').primaryKey(),
		state: text('state').notNull().default('building'),
		trialStartedAt: timestamp('trial_started_at', { withTimezone: true, mode: 'date' }),
		trialEndsAt: timestamp('trial_ends_at', { withTimezone: true, mode: 'date' }),
		phoneHistoryRef: text('phone_history_ref'),
		graceEndsAt: timestamp('grace_ends_at', { withTimezone: true, mode: 'date' }),
		billingContinuity: text('billing_continuity').notNull().default('new'),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(table) => [index('listing_phone_history_ref_idx').on(table.phoneHistoryRef)]
);
