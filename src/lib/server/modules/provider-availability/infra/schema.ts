import { pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const providerAvailabilitySchema = pgSchema('provider_availability');

export const availabilityStatus = providerAvailabilitySchema.table('availability_status', {
	providerProfileId: uuid('provider_profile_id').primaryKey(),
	state: text('state').notNull().default('not_available'),
	setAt: timestamp('set_at', { withTimezone: true, mode: 'date' }),
	expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
	warnedAt: timestamp('warned_at', { withTimezone: true, mode: 'date' }),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
});

export const availabilityHistory = providerAvailabilitySchema.table('availability_history', {
	id: uuid('id').primaryKey(),
	providerProfileId: uuid('provider_profile_id').notNull(),
	eventType: text('event_type').notNull(),
	occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull(),
	setAt: timestamp('set_at', { withTimezone: true, mode: 'date' }),
	correlationId: text('correlation_id').notNull()
});

/** @deprecated use availabilityStatus — kept for seed-core import alias */
export const availability = availabilityStatus;
