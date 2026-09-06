import {
	boolean,
	customType,
	index,
	inet,
	integer,
	pgSchema,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: unknown }>({
	dataType() {
		return 'bytea';
	},
	fromDriver(value: unknown) {
		if (Buffer.isBuffer(value)) return value;
		if (typeof value === 'string' && value.startsWith('\\x')) {
			return Buffer.from(value.slice(2), 'hex');
		}
		throw new Error('invalid bytea value');
	}
});

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

export const passwordResetTokens = identitySchema.table(
	'password_reset_token',
	{
		id: uuid('id').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		tokenHash: text('token_hash').notNull().unique(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
		expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
		consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [index('prt_user_idx').on(table.userId), index('prt_expiry_idx').on(table.expiresAt)]
);

export const phoneOtps = identitySchema.table(
	'phone_otp',
	{
		id: uuid('id').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		phone: text('phone').notNull(),
		codeHash: text('code_hash').notNull(),
		purpose: text('purpose').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
		expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
		attemptCount: integer('attempt_count').notNull().default(0),
		consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [
		index('phone_otp_user_idx').on(table.userId),
		index('phone_otp_expiry_idx').on(table.expiresAt)
	]
);

export const phoneRegistryHistory = identitySchema.table('phone_registry_history', {
	phoneHash: text('phone_hash').primaryKey(),
	firstRegisteredAt: timestamp('first_registered_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.defaultNow(),
	lastRegisteredAt: timestamp('last_registered_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.defaultNow()
});

export const adminTotp = identitySchema.table('admin_totp', {
	userId: uuid('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	secretEncrypted: bytea('secret_encrypted').notNull(),
	enrolledAt: timestamp('enrolled_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
	backupCodesHash: text('backup_codes_hash').array().notNull()
});

export const termsAcceptance = identitySchema.table(
	'terms_acceptance',
	{
		id: uuid('id').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		documentSlug: text('document_slug').notNull(),
		documentVersion: text('document_version').notNull(),
		acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
	},
	(table) => [
		uniqueIndex('terms_acceptance_user_doc_uq').on(table.userId, table.documentSlug),
		index('terms_acceptance_user_idx').on(table.userId)
	]
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
