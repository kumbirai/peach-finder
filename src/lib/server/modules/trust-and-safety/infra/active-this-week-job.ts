import { eq, sql } from 'drizzle-orm';
import type { Database, Transaction } from '../../../db';
import { hasSentSince } from '../../direct-messaging/infra/presence-read';
import { hasSignedInSince } from '../../identity-and-access/infra/session-activity-read';
import { getRecentActivityCount } from '../../provider-availability/infra/availability-commands';
import { updatedAtSince } from '../../provider-profile/infra/profile-activity-read';
import { asInstant } from '../../../shared/clock';
import type { DomainEvent } from '../../../shared/events';
import { newId, type ProviderProfileId, type UserId } from '../../../shared/ids';
import { publish } from '../../../shared/outbox';
import {
	activeThisWeekWindowStart,
	isActiveThisWeek,
	type ActiveThisWeekSignals
} from '../domain/active-this-week';
import { badgeState } from './schema';

type PublishedProvider = {
	providerProfileId: ProviderProfileId;
	ownerId: UserId;
};

export type ActiveThisWeekJobResult = {
	evaluated: number;
	granted: ProviderProfileId[];
	revoked: ProviderProfileId[];
};

export async function evaluateActiveThisWeekSignals(
	db: Database,
	provider: PublishedProvider,
	since: Date
): Promise<ActiveThisWeekSignals> {
	const [signedIn, availabilityCount, profileEdited, messageSent] = await Promise.all([
		hasSignedInSince(db, provider.ownerId, since),
		getRecentActivityCount(db, provider.providerProfileId, since),
		updatedAtSince(db, provider.providerProfileId, since),
		hasSentSince(db, provider.ownerId, since)
	]);

	return {
		signedIn,
		availabilitySet: availabilityCount > 0,
		profileEdited,
		messageSent
	};
}

async function listPublishedProviders(db: Database): Promise<PublishedProvider[]> {
	const rows = await db.execute<{ id: string; owner_id: string }>(sql`
		select p.id, p.owner_id
		from provider_profile.provider_profile p
		inner join listing_billing.listing l on l.provider_profile_id = p.id
		where p.publish_state = 'published' and l.state = 'free_listed'
	`);
	return (rows as unknown as { id: string; owner_id: string }[]).map((row) => ({
		providerProfileId: row.id as ProviderProfileId,
		ownerId: row.owner_id as UserId
	}));
}

async function loadCurrentBadgeState(
	tx: Transaction,
	providerProfileId: ProviderProfileId
): Promise<boolean> {
	const rows = await tx
		.select({ activeThisWeek: badgeState.activeThisWeek })
		.from(badgeState)
		.where(eq(badgeState.providerProfileId, providerProfileId))
		.limit(1);
	return rows[0]?.activeThisWeek ?? false;
}

async function grantActiveThisWeekBadge(
	tx: Transaction,
	providerProfileId: ProviderProfileId,
	now: Date,
	correlationId: string
): Promise<void> {
	const existing = await tx
		.select({ providerProfileId: badgeState.providerProfileId })
		.from(badgeState)
		.where(eq(badgeState.providerProfileId, providerProfileId))
		.limit(1);

	if (existing.length === 0) {
		await tx.insert(badgeState).values({
			providerProfileId,
			activeThisWeek: true,
			activeThisWeekSince: now,
			updatedAt: now
		});
	} else {
		await tx
			.update(badgeState)
			.set({
				activeThisWeek: true,
				activeThisWeekSince: now,
				updatedAt: now
			})
			.where(eq(badgeState.providerProfileId, providerProfileId));
	}

	const event: DomainEvent<
		'BadgeGranted',
		{ providerProfileId: string; badge: string; reason: string }
	> = {
		eventId: newId<'OutboxEventId'>(),
		eventName: 'BadgeGranted',
		version: 1,
		occurredAt: asInstant(now.toISOString()),
		correlationId,
		payload: {
			providerProfileId,
			badge: 'active_this_week',
			reason: 'activity_computation'
		}
	};
	await publish(tx, event);
}

async function revokeActiveThisWeekBadge(
	tx: Transaction,
	providerProfileId: ProviderProfileId,
	now: Date,
	correlationId: string
): Promise<void> {
	await tx
		.update(badgeState)
		.set({
			activeThisWeek: false,
			activeThisWeekSince: null,
			updatedAt: now
		})
		.where(eq(badgeState.providerProfileId, providerProfileId));

	const event: DomainEvent<
		'BadgeRevoked',
		{ providerProfileId: string; badge: string; reason: string }
	> = {
		eventId: newId<'OutboxEventId'>(),
		eventName: 'BadgeRevoked',
		version: 1,
		occurredAt: asInstant(now.toISOString()),
		correlationId,
		payload: {
			providerProfileId,
			badge: 'active_this_week',
			reason: 'activity_computation'
		}
	};
	await publish(tx, event);
}

export async function runActiveThisWeekJob(
	db: Database,
	now: Date,
	correlationId: string
): Promise<ActiveThisWeekJobResult> {
	const since = activeThisWeekWindowStart(now);
	const providers = await listPublishedProviders(db);
	const granted: ProviderProfileId[] = [];
	const revoked: ProviderProfileId[] = [];

	for (const provider of providers) {
		const signals = await evaluateActiveThisWeekSignals(db, provider, since);
		const active = isActiveThisWeek(signals);

		await db.transaction(async (tx) => {
			const currentlyActive = await loadCurrentBadgeState(tx, provider.providerProfileId);

			if (active && !currentlyActive) {
				await grantActiveThisWeekBadge(tx, provider.providerProfileId, now, correlationId);
				granted.push(provider.providerProfileId);
				return;
			}

			if (!active && currentlyActive) {
				await revokeActiveThisWeekBadge(tx, provider.providerProfileId, now, correlationId);
				revoked.push(provider.providerProfileId);
			}
		});
	}

	return {
		evaluated: providers.length,
		granted,
		revoked
	};
}
