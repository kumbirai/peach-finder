import { and, eq, sql } from 'drizzle-orm';
import type { Database, Transaction } from '../../../db';
import { getOwnedProfileIdDb } from '../../provider-profile';
import { newId, type ProviderProfileId, type UserId } from '../../../shared/ids';
import { asInstant } from '../../../shared/clock';
import type { DomainEvent } from '../../../shared/events';
import { markProcessed, publish } from '../../../shared/outbox';
import { updateSearchBadgeFlag } from '../../discovery-search';
import { badgeState, verificationCases } from './schema';

export const BADGE_SUPPRESSION_REASON =
	'You changed identity details we verified. Your Identity verified badge is hidden until our team quickly re-checks your name or phone. Your profile stays live — seekers can still find and message you.';

type IdentityAttributesChangedPayload = {
	userId: string;
	changedFields: string[];
};

const IDENTITY_RELEVANT = new Set(['display_name', 'phone']);

export async function handleIdentityAttributesChanged(
	db: Database,
	event: DomainEvent<'IdentityAttributesChanged', IdentityAttributesChangedPayload>
): Promise<void> {
	const changed = event.payload.changedFields.filter((field) => IDENTITY_RELEVANT.has(field));
	if (changed.length === 0) return;

	await db.transaction(async (tx) => {
		const firstTime = await markProcessed(tx, event.eventId, 'trust-and-safety');
		if (!firstTime) return;

		const profileId = await getOwnedProfileIdDb(tx, event.payload.userId as UserId);
		if (!profileId) return;

		await suppressIdentityBadge(tx, profileId, event.correlationId, new Date(event.occurredAt));
	});
}

async function suppressIdentityBadge(
	tx: Transaction,
	providerProfileId: ProviderProfileId,
	correlationId: string,
	now: Date
): Promise<void> {
	const rows = await tx
		.select({
			identityVerified: badgeState.identityVerified,
			suppressed: badgeState.suppressed
		})
		.from(badgeState)
		.where(eq(badgeState.providerProfileId, providerProfileId))
		.limit(1);

	const state = rows[0];
	if (!state?.identityVerified || state.suppressed) return;

	await tx
		.update(badgeState)
		.set({
			suppressed: true,
			suppressedReason: BADGE_SUPPRESSION_REASON,
			updatedAt: now
		})
		.where(eq(badgeState.providerProfileId, providerProfileId));

	const pendingCase = await tx
		.select({ id: verificationCases.id })
		.from(verificationCases)
		.where(
			and(
				eq(verificationCases.providerProfileId, providerProfileId),
				eq(verificationCases.status, 'pending')
			)
		)
		.limit(1);

	if (pendingCase.length === 0) {
		await tx.insert(verificationCases).values({
			id: newId<'VerificationCaseId'>(),
			providerProfileId,
			status: 'pending',
			submittedAt: now
		});
	}

	const revoked: DomainEvent<
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
			badge: 'identity_verified',
			reason: 'suppressed_pending_rereview'
		}
	};
	await publish(tx, revoked);
}

export async function ensureBadgeStateFromLegacy(
	tx: Transaction,
	providerProfileId: ProviderProfileId,
	now: Date
): Promise<void> {
	const existing = await tx
		.select({ providerProfileId: badgeState.providerProfileId })
		.from(badgeState)
		.where(eq(badgeState.providerProfileId, providerProfileId))
		.limit(1);
	if (existing.length > 0) return;

	const legacy = await tx.execute<{
		identity_verified: boolean;
		identity_since: Date | null;
		active_this_week: boolean;
		active_since: Date | null;
	}>(sql`
		select
			bool_or(badge = 'identity_verified') as identity_verified,
			min(case when badge = 'identity_verified' then granted_at end) as identity_since,
			bool_or(badge = 'active_this_week') as active_this_week,
			min(case when badge = 'active_this_week' then granted_at end) as active_since
		from trust_and_safety.provider_badge
		where provider_profile_id = ${providerProfileId}::uuid
	`);

	const row = (
		legacy as unknown as Array<{
			identity_verified: boolean;
			identity_since: Date | null;
			active_this_week: boolean;
			active_since: Date | null;
		}>
	)[0];
	if (!row?.identity_verified && !row?.active_this_week) return;

	await tx.insert(badgeState).values({
		providerProfileId,
		identityVerified: Boolean(row.identity_verified),
		identityVerifiedSince: row.identity_since,
		activeThisWeek: Boolean(row.active_this_week),
		activeThisWeekSince: row.active_since,
		updatedAt: now
	});
}

export async function handleBadgeFlagEvent(
	db: Database,
	event: DomainEvent<
		'BadgeGranted' | 'BadgeRevoked',
		{ providerProfileId: string; badge: string; reason?: string }
	>
): Promise<void> {
	const subscriber = 'discovery-search.badge-flag';
	await db.transaction(async (tx) => {
		const firstTime = await markProcessed(tx, event.eventId, subscriber);
		if (!firstTime) return;

		await updateSearchBadgeFlag(
			tx,
			event.payload.providerProfileId as ProviderProfileId,
			event.payload.badge,
			event.eventName === 'BadgeGranted',
			new Date(event.occurredAt)
		);
	});
}
