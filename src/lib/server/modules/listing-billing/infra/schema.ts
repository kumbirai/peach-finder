import { boolean, index, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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
		pspCustomerRef: text('psp_customer_ref'),
		pspAuthorizationCode: text('psp_authorization_code'),
		cardLast4: text('card_last4'),
		cardBrand: text('card_brand'),
		cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
		currentPeriodEndsAt: timestamp('current_period_ends_at', { withTimezone: true, mode: 'date' }),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(table) => [index('listing_phone_history_ref_idx').on(table.phoneHistoryRef)]
);

export const invoices = listingBillingSchema.table(
	'invoice',
	{
		id: uuid('id').primaryKey(),
		providerProfileId: uuid('provider_profile_id')
			.notNull()
			.references(() => listings.providerProfileId, { onDelete: 'cascade' }),
		lineItem: text('line_item').notNull(),
		amountCents: integer('amount_cents').notNull(),
		currency: text('currency').notNull().default('ZAR'),
		status: text('status').notNull(),
		pspInvoiceRef: text('psp_invoice_ref'),
		issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
		paidAt: timestamp('paid_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [index('invoice_provider_idx').on(table.providerProfileId, table.issuedAt)]
);
