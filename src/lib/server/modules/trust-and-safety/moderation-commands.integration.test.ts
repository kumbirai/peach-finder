import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withTestDatabase } from '../../db/test-harness';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import {
	seedCore,
	SEED_CORE_PRIMARY_PROFILE_ID,
	SEED_ADMIN_USER_ID
} from '../../../../../scripts/seed-core';
import { asInstant } from '../../shared/clock';
import type { DomainEvent } from '../../shared/events';
import { asId } from '../../shared/ids';
import { auditLog, outbox } from '../../shared/schema';
import { providerProfiles } from '../provider-profile/infra/schema';
import { handleProviderProfileModeration } from '../provider-profile';
import { findActiveSession, createSession } from '../identity-and-access';
import {
	unpublishProfile,
	suspendAccount,
	reinstateAccount,
	revokeBadge,
	removePhoto
} from './index';
import { badgeState, moderationActions } from './infra/schema';
import { handleModerationActionTaken } from '../user-notifications';
import { handleMediaModeration } from '../media-processing';
import { photos } from '../media-processing/infra/schema';
import { notificationLog } from '../user-notifications/infra/schema';

const ADMIN_ID = asId<'UserId'>(SEED_ADMIN_USER_ID);
const PRIMARY_PROFILE_ID = asId<'ProviderProfileId'>(SEED_CORE_PRIMARY_PROFILE_ID);
const PRIMARY_OWNER_ID = asId<'UserId'>('01900000-0000-7000-8000-000000000001');
const PRIMARY_PHOTO_ID = asId<'PhotoId'>('01900000-0000-7000-8000-000000000301');

describe('US-ADMIN-04 moderation commands integration', () => {
	it('duplicate moderation with the same idempotency key is a no-op', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const now = new Date('2026-09-06T12:00:00.000Z');
			const input = {
				adminId: ADMIN_ID,
				providerProfileId: PRIMARY_PROFILE_ID,
				reason: 'Policy violation confirmed.',
				idempotencyKey: 'unpublish-dedup',
				correlationId: 'corr-dedup',
				now
			};

			const first = await unpublishProfile(db, input);
			const second = await unpublishProfile(db, input);
			expect(first.ok).toBe(true);
			expect(second.ok).toBe(true);
			if (first.ok && second.ok) {
				expect(second.value.moderationActionId).toBe(first.value.moderationActionId);
			}

			const actions = await db
				.select()
				.from(moderationActions)
				.where(eq(moderationActions.action, 'unpublish'));
			const forProfile = actions.filter((row) => row.targetId === PRIMARY_PROFILE_ID);
			expect(forProfile).toHaveLength(1);
		});
	});

	it('TC-ADMIN-04a: rejects moderation without a reason', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const result = await unpublishProfile(db, {
				adminId: ADMIN_ID,
				providerProfileId: PRIMARY_PROFILE_ID,
				reason: '   ',
				idempotencyKey: 'no-reason',
				correlationId: 'corr-no-reason',
				now: new Date()
			});
			expect(result.ok).toBe(false);
		});
	});

	it('TC-ADMIN-04b: unpublish writes audit and notifies provider atomically with the command', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const now = new Date('2026-09-06T12:00:00.000Z');
			const result = await unpublishProfile(db, {
				adminId: ADMIN_ID,
				providerProfileId: PRIMARY_PROFILE_ID,
				reason: 'Policy violation confirmed.',
				idempotencyKey: 'unpublish-once',
				correlationId: 'corr-unpublish',
				now
			});
			expect(result.ok).toBe(true);

			const audits = await db
				.select()
				.from(auditLog)
				.where(
					and(
						eq(auditLog.action, 'moderation.unpublish'),
						eq(auditLog.targetId, PRIMARY_PROFILE_ID)
					)
				);
			expect(audits[0]?.reason).toBe('Policy violation confirmed.');

			const actions = await db
				.select()
				.from(moderationActions)
				.where(eq(moderationActions.action, 'unpublish'));
			expect(actions.length).toBeGreaterThan(0);

			const events = await db
				.select()
				.from(outbox)
				.where(eq(outbox.eventName, 'ModerationActionTaken'));
			expect(events.length).toBeGreaterThan(0);

			const event = events[events.length - 1]!;
			const domainEvent: DomainEvent<'ModerationActionTaken', Record<string, unknown>> = {
				eventId: asId<'OutboxEventId'>(event.eventId),
				eventName: 'ModerationActionTaken',
				version: 1,
				occurredAt: asInstant(event.occurredAt.toISOString()),
				correlationId: event.correlationId,
				payload: event.payload as Record<string, unknown>
			};
			await handleProviderProfileModeration(db, domainEvent as never);

			const profile = await db
				.select({ publishState: providerProfiles.publishState })
				.from(providerProfiles)
				.where(eq(providerProfiles.id, PRIMARY_PROFILE_ID))
				.limit(1);
			expect(profile[0]?.publishState).toBe('unpublished');

			await handleModerationActionTaken(db, domainEvent as never);

			const notifications = await db
				.select()
				.from(notificationLog)
				.where(
					and(
						eq(notificationLog.userId, PRIMARY_OWNER_ID),
						eq(notificationLog.category, 'moderation_outcome')
					)
				);
			expect(notifications.length).toBeGreaterThan(0);
		});
	});

	it('TC-ADMIN-04c: admin unpublish is not a republish gate', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const now = new Date('2026-09-06T12:00:00.000Z');
			const unpublished = await unpublishProfile(db, {
				adminId: ADMIN_ID,
				providerProfileId: PRIMARY_PROFILE_ID,
				reason: 'Temporary removal.',
				idempotencyKey: 'unpublish-republish',
				correlationId: 'corr-republish',
				now
			});
			expect(unpublished.ok).toBe(true);

			const eventRows = await db
				.select()
				.from(outbox)
				.where(eq(outbox.eventName, 'ModerationActionTaken'));
			const event = eventRows[eventRows.length - 1]!;
			const domainEvent: DomainEvent<'ModerationActionTaken', Record<string, unknown>> = {
				eventId: asId<'OutboxEventId'>(event.eventId),
				eventName: 'ModerationActionTaken',
				version: 1,
				occurredAt: asInstant(event.occurredAt.toISOString()),
				correlationId: event.correlationId,
				payload: event.payload as Record<string, unknown>
			};
			await handleProviderProfileModeration(db, domainEvent as never);

			const { publishProfileForOwner } = await import('../provider-profile');
			const republished = await publishProfileForOwner(
				db,
				PRIMARY_OWNER_ID,
				'corr-owner-republish',
				now
			);
			expect(republished.ok).toBe(true);

			const profile = await db
				.select({ publishState: providerProfiles.publishState })
				.from(providerProfiles)
				.where(eq(providerProfiles.id, PRIMARY_PROFILE_ID))
				.limit(1);
			expect(profile[0]?.publishState).toBe('published');
		});
	});

	it('suspend revokes active sessions in the same transaction', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const { token } = await createSession(db, {
				userId: PRIMARY_OWNER_ID,
				ipAddress: '127.0.0.1',
				userAgent: 'vitest',
				now: new Date('2026-09-06T10:00:00.000Z')
			});

			const suspended = await suspendAccount(db, {
				adminId: ADMIN_ID,
				userId: PRIMARY_OWNER_ID,
				reason: 'Harassment confirmed.',
				idempotencyKey: 'suspend-once',
				correlationId: 'corr-suspend',
				now: new Date('2026-09-06T12:00:00.000Z')
			});
			expect(suspended.ok).toBe(true);

			const session = await findActiveSession(db, token, new Date('2026-09-06T12:01:00.000Z'));
			expect(session).toBeNull();
		});
	});

	it('reinstate restores active status without reviving old sessions', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const { token } = await createSession(db, {
				userId: PRIMARY_OWNER_ID,
				ipAddress: '127.0.0.1',
				userAgent: 'vitest',
				now: new Date('2026-09-06T10:00:00.000Z')
			});

			await suspendAccount(db, {
				adminId: ADMIN_ID,
				userId: PRIMARY_OWNER_ID,
				reason: 'Temporary suspension.',
				idempotencyKey: 'suspend-for-reinstate',
				correlationId: 'corr-suspend-2',
				now: new Date('2026-09-06T12:00:00.000Z')
			});

			const reinstated = await reinstateAccount(db, {
				adminId: ADMIN_ID,
				userId: PRIMARY_OWNER_ID,
				reason: 'Appeal accepted.',
				idempotencyKey: 'reinstate-once',
				correlationId: 'corr-reinstate',
				now: new Date('2026-09-06T13:00:00.000Z')
			});
			expect(reinstated.ok).toBe(true);

			const stale = await findActiveSession(db, token, new Date('2026-09-06T13:01:00.000Z'));
			expect(stale).toBeNull();

			const { token: freshToken } = await createSession(db, {
				userId: PRIMARY_OWNER_ID,
				ipAddress: '127.0.0.1',
				userAgent: 'vitest',
				now: new Date('2026-09-06T13:05:00.000Z')
			});
			const fresh = await findActiveSession(db, freshToken, new Date('2026-09-06T13:06:00.000Z'));
			expect(fresh?.userId).toBe(PRIMARY_OWNER_ID);
		});
	});

	it('remove photo moderation deletes the photo when the subscriber runs', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const now = new Date('2026-09-06T12:00:00.000Z');
			const result = await removePhoto(db, {
				adminId: ADMIN_ID,
				photoId: PRIMARY_PHOTO_ID,
				reason: 'Inappropriate content.',
				idempotencyKey: 'remove-photo-once',
				correlationId: 'corr-remove-photo',
				now
			});
			expect(result.ok).toBe(true);

			const eventRows = await db
				.select()
				.from(outbox)
				.where(eq(outbox.eventName, 'ModerationActionTaken'));
			const event = eventRows[eventRows.length - 1]!;
			const domainEvent: DomainEvent<'ModerationActionTaken', Record<string, unknown>> = {
				eventId: asId<'OutboxEventId'>(event.eventId),
				eventName: 'ModerationActionTaken',
				version: 1,
				occurredAt: asInstant(event.occurredAt.toISOString()),
				correlationId: event.correlationId,
				payload: event.payload as Record<string, unknown>
			};
			await handleMediaModeration(db, domainEvent as never);

			const remaining = await db.select().from(photos).where(eq(photos.id, PRIMARY_PHOTO_ID));
			expect(remaining).toHaveLength(0);
		});
	});

	it('revoke badge clears identity verification without affecting publish state', async () => {
		await withTestDatabase(async (db) => {
			await seedPlatform(db);
			await loadConfigCache(db);
			await seedCore(db);

			const now = new Date('2026-09-06T12:00:00.000Z');
			const revoked = await revokeBadge(db, {
				adminId: ADMIN_ID,
				providerProfileId: PRIMARY_PROFILE_ID,
				reason: 'Fraudulent documents.',
				idempotencyKey: 'revoke-badge',
				correlationId: 'corr-revoke',
				now
			});
			expect(revoked.ok).toBe(true);

			const badge = await db
				.select()
				.from(badgeState)
				.where(eq(badgeState.providerProfileId, PRIMARY_PROFILE_ID))
				.limit(1);
			expect(badge[0]?.identityVerified).toBe(false);

			const profile = await db
				.select({ publishState: providerProfiles.publishState })
				.from(providerProfiles)
				.where(eq(providerProfiles.id, PRIMARY_PROFILE_ID))
				.limit(1);
			expect(profile[0]?.publishState).toBe('published');

			const events = await db
				.select()
				.from(outbox)
				.where(eq(outbox.eventName, 'ModerationActionTaken'));
			const revokeEvent = events.find(
				(row) => (row.payload as { action?: string }).action === 'revoke_badge'
			);
			expect(revokeEvent).toBeTruthy();

			const domainEvent: DomainEvent<'ModerationActionTaken', Record<string, unknown>> = {
				eventId: asId<'OutboxEventId'>(revokeEvent!.eventId),
				eventName: 'ModerationActionTaken',
				version: 1,
				occurredAt: asInstant(revokeEvent!.occurredAt.toISOString()),
				correlationId: revokeEvent!.correlationId,
				payload: revokeEvent!.payload as Record<string, unknown>
			};
			await handleModerationActionTaken(db, domainEvent as never);

			const notifications = await db
				.select()
				.from(notificationLog)
				.where(
					and(
						eq(notificationLog.userId, PRIMARY_OWNER_ID),
						eq(notificationLog.category, 'moderation_outcome')
					)
				);
			expect(
				notifications.some((row) => row.body?.includes('Fraudulent documents.') ?? false)
			).toBe(true);
		});
	});
});
