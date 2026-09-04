import {
	boolean,
	index,
	inet,
	pgSchema,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';

export const identitySchema = pgSchema('identity_and_access');

export const users = identitySchema.table(
	'user',
	{
		id: uuid('id').primaryKey(),
		isAdmin: boolean('is_admin').notNull().default(false),
		email: text('email'),
		emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true, mode: 'date' }),
		phone: text('phone'),
		phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true, mode: 'date' }),
		passwordHash: text('password_hash'),
		displayName: text('display_name').notNull(),
		status: text('status').notNull().default('active'),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
		deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
		anonymizedAt: timestamp('anonymized_at', { withTimezone: true, mode: 'date' }),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(table) => [
		uniqueIndex('user_email_uq').on(table.email),
		uniqueIndex('user_active_phone_idx').on(table.phone),
		index('user_phone_idx').on(table.phone)
	]
);

export const oauthLinks = identitySchema.table(
	'oauth_link',
	{
		id: uuid('id').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		provider: text('provider').notNull(),
		providerSubject: text('provider_subject').notNull(),
		emailAtLink: text('email_at_link'),
		linkedAt: timestamp('linked_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(table) => [uniqueIndex('oauth_provider_subject_uq').on(table.provider, table.providerSubject)]
);

export const emailVerificationTokens = identitySchema.table(
	'email_verification_token',
	{
		id: uuid('id').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		email: text('email').notNull(),
		tokenHash: text('token_hash').notNull().unique(),
		purpose: text('purpose').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
		expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
		consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [index('evt_user_idx').on(table.userId), index('evt_expiry_idx').on(table.expiresAt)]
);

export const sessions = identitySchema.table(
	'session',
	{
		id: uuid('id').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id),
		tokenHash: text('token_hash').notNull().unique(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
		lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),
		expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
		revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
		reauthAt: timestamp('reauth_at', { withTimezone: true, mode: 'date' }),
		ipAddress: inet('ip_address').notNull(),
		userAgent: text('user_agent')
	},
	(table) => [
		index('session_user_idx').on(table.userId),
		index('session_expiry_idx').on(table.expiresAt)
	]
);
