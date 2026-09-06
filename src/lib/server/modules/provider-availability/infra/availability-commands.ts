import { and, eq, ne, sql } from 'drizzle-orm';
import type { Database, Transaction } from '../../../db';
import { mirrorAvailabilityOnProjection } from '../../discovery-search';
import { getConfig } from '../../platform-configuration';
import { loadOwnerProfile } from '../../provider-profile';
import {
	activeThisWeekWindowStart,
	evaluateActiveThisWeekSignals,
	isActiveThisWeek,
	loadBadgeDisplayState
} from '../../trust-and-safety';
import { asInstant } from '../../../shared/clock';
import type { DomainEvent } from '../../../shared/events';
import { newId, type ProviderProfileId, type UserId } from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { publish } from '../../../shared/outbox';
import { clear, setAvailable, type AvailabilityStatus } from '../domain/availability-status';
import { availabilityHistory, availabilityStatus } from './schema';

export type AvailabilityStatusDto = {
	state: 'not_available' | 'available' | 'expiry_warned';
	setAt: string | null;
	expiresAt: string | null;
	expiresInSeconds: number | null;
};

export type ActiveThisWeekTransparencyDto = {
	qualifies: boolean;
	badgeActive: boolean;
	sinceIso: string;
	signals: {
		signedIn: boolean;
		availabilitySet: boolean;
		availabilitySetCount: number;
		profileEdited: boolean;
		messageSent: boolean;
	};
};

export type AvailabilityTransparencyDto = {
	availability: AvailabilityStatusDto;
	activeThisWeek: ActiveThisWeekTransparencyDto;
};

async function requireOwnedProfile(
	db: Database | Transaction,
	userId: UserId
): Promise<Result<{ profileId: ProviderProfileId }, UseCaseError>> {
	const profile = await loadOwnerProfile(db, userId);
	if (!profile) return Err({ kind: 'not_found', resource: 'provider_profile' });
	return Ok({ profileId: profile.profileId as ProviderProfileId });
}

function rowToStatus(
	providerProfileId: ProviderProfileId,
	row?: {
		state: string;
		setAt: Date | null;
		expiresAt: Date | null;
		warnedAt: Date | null;
	}
): AvailabilityStatus {
	if (!row || row.state === 'not_available') {
		return { kind: 'NotAvailable', providerProfileId };
	}
	if (row.state === 'expiry_warned' && row.setAt && row.expiresAt && row.warnedAt) {
		return {
			kind: 'ExpiryWarned',
			providerProfileId,
			setAt: asInstant(row.setAt.toISOString()),
			expiresAt: asInstant(row.expiresAt.toISOString()),
			warnedAt: asInstant(row.warnedAt.toISOString())
		};
	}
	if (row.setAt && row.expiresAt) {
		return {
			kind: 'Available',
			providerProfileId,
			setAt: asInstant(row.setAt.toISOString()),
			expiresAt: asInstant(row.expiresAt.toISOString())
		};
	}
	return { kind: 'NotAvailable', providerProfileId };
}

export async function loadAvailabilityStatus(
	db: Database,
	providerProfileId: ProviderProfileId
): Promise<AvailabilityStatus> {
	const rows = await db
		.select({
			state: availabilityStatus.state,
			setAt: availabilityStatus.setAt,
			expiresAt: availabilityStatus.expiresAt,
			warnedAt: availabilityStatus.warnedAt
		})
		.from(availabilityStatus)
		.where(eq(availabilityStatus.providerProfileId, providerProfileId))
		.limit(1);
	return rowToStatus(providerProfileId, rows[0]);
}

export function toAvailabilityStatusDto(
	status: AvailabilityStatus,
	now: Date
): AvailabilityStatusDto {
	if (status.kind === 'NotAvailable') {
		return {
			state: 'not_available',
			setAt: null,
			expiresAt: null,
			expiresInSeconds: null
		};
	}

	const expiresInSeconds = Math.max(
		0,
		Math.floor((new Date(status.expiresAt).getTime() - now.getTime()) / 1000)
	);

	return {
		state: status.kind === 'ExpiryWarned' ? 'expiry_warned' : 'available',
		setAt: status.setAt,
		expiresAt: status.expiresAt,
		expiresInSeconds
	};
}

function expiryMinutesFromConfig(): number {
	return getConfig('provider-availability.expiry_minutes');
}

export async function setAvailabilityForOwner(
	db: Database,
	userId: UserId,
	correlationId: string,
	now: Date
): Promise<Result<AvailabilityStatusDto, UseCaseError>> {
	const owned = await requireOwnedProfile(db, userId);
	if (!owned.ok) return owned;

	const profileId = owned.value.profileId;
	const expiryMinutes = expiryMinutesFromConfig();
	const expiresAt = new Date(now.getTime() + expiryMinutes * 60_000);

	let dto: AvailabilityStatusDto = toAvailabilityStatusDto(
		{ kind: 'NotAvailable', providerProfileId: profileId },
		now
	);

	await db.transaction(async (tx) => {
		const rows = await tx
			.select({
				state: availabilityStatus.state,
				setAt: availabilityStatus.setAt,
				expiresAt: availabilityStatus.expiresAt,
				warnedAt: availabilityStatus.warnedAt
			})
			.from(availabilityStatus)
			.where(eq(availabilityStatus.providerProfileId, profileId))
			.limit(1);

		const current = rowToStatus(profileId, rows[0]);
		const transition = setAvailable(
			current,
			asInstant(now.toISOString()),
			asInstant(expiresAt.toISOString())
		);
		const next = transition.next;

		await tx
			.insert(availabilityStatus)
			.values({
				providerProfileId: profileId,
				state: 'available',
				setAt: now,
				expiresAt,
				warnedAt: null,
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: availabilityStatus.providerProfileId,
				set: {
					state: 'available',
					setAt: now,
					expiresAt,
					warnedAt: null,
					updatedAt: now
				}
			});

		await tx.insert(availabilityHistory).values({
			id: newId<'AvailabilityEventId'>(),
			providerProfileId: profileId,
			eventType: transition.historyType,
			occurredAt: now,
			setAt: now,
			correlationId
		});

		const event: DomainEvent<'AvailabilitySet', { providerProfileId: string; setAt: string }> = {
			eventId: newId(),
			eventName: 'AvailabilitySet',
			version: 1,
			occurredAt: asInstant(now.toISOString()),
			correlationId,
			payload: {
				providerProfileId: profileId,
				setAt: now.toISOString()
			}
		};
		await publish(tx, event);

		await mirrorAvailabilityOnProjection(tx, profileId, 'available', now, now);

		dto = toAvailabilityStatusDto(next, now);
	});

	return Ok(dto);
}

export async function clearAvailabilityForOwner(
	db: Database,
	userId: UserId,
	correlationId: string,
	now: Date
): Promise<Result<AvailabilityStatusDto, UseCaseError>> {
	const owned = await requireOwnedProfile(db, userId);
	if (!owned.ok) return owned;

	const profileId = owned.value.profileId;
	let dto: AvailabilityStatusDto = toAvailabilityStatusDto(
		{ kind: 'NotAvailable', providerProfileId: profileId },
		now
	);

	await db.transaction(async (tx) => {
		const rows = await tx
			.select({
				state: availabilityStatus.state,
				setAt: availabilityStatus.setAt,
				expiresAt: availabilityStatus.expiresAt,
				warnedAt: availabilityStatus.warnedAt
			})
			.from(availabilityStatus)
			.where(eq(availabilityStatus.providerProfileId, profileId))
			.limit(1);

		const current = rowToStatus(profileId, rows[0]);
		const cleared = clear(current);
		if (!cleared.ok) {
			dto = toAvailabilityStatusDto(current, now);
			return;
		}

		const updated = await tx
			.update(availabilityStatus)
			.set({
				state: 'not_available',
				setAt: null,
				expiresAt: null,
				warnedAt: null,
				updatedAt: now
			})
			.where(
				and(
					eq(availabilityStatus.providerProfileId, profileId),
					ne(availabilityStatus.state, 'not_available')
				)
			)
			.returning({ providerProfileId: availabilityStatus.providerProfileId });

		if (updated.length === 0) {
			dto = toAvailabilityStatusDto(cleared.value, now);
			return;
		}

		await tx.insert(availabilityHistory).values({
			id: newId<'AvailabilityEventId'>(),
			providerProfileId: profileId,
			eventType: 'cleared',
			occurredAt: now,
			setAt: null,
			correlationId
		});

		const event: DomainEvent<'AvailabilityCleared', { providerProfileId: string }> = {
			eventId: newId(),
			eventName: 'AvailabilityCleared',
			version: 1,
			occurredAt: asInstant(now.toISOString()),
			correlationId,
			payload: { providerProfileId: profileId }
		};
		await publish(tx, event);

		await mirrorAvailabilityOnProjection(tx, profileId, 'not_available', null, now);

		dto = toAvailabilityStatusDto(cleared.value, now);
	});

	return Ok(dto);
}

export async function getAvailabilityStatusForOwner(
	db: Database,
	userId: UserId,
	now: Date
): Promise<Result<AvailabilityStatusDto, UseCaseError>> {
	const owned = await requireOwnedProfile(db, userId);
	if (!owned.ok) return owned;

	const status = await loadAvailabilityStatus(db, owned.value.profileId);
	return Ok(toAvailabilityStatusDto(status, now));
}

export async function getAvailabilityTransparencyForOwner(
	db: Database,
	userId: UserId,
	now: Date
): Promise<Result<AvailabilityTransparencyDto, UseCaseError>> {
	const profile = await loadOwnerProfile(db, userId);
	if (!profile) return Err({ kind: 'not_found', resource: 'provider_profile' });

	const profileId = profile.profileId as ProviderProfileId;
	const since = activeThisWeekWindowStart(now);

	const [status, availabilityCount, evaluatedSignals, badgeDisplay] = await Promise.all([
		loadAvailabilityStatus(db, profileId),
		getRecentActivityCount(db, profileId, since),
		evaluateActiveThisWeekSignals(db, { providerProfileId: profileId, ownerId: userId }, since),
		loadBadgeDisplayState(db, profileId)
	]);

	return Ok({
		availability: toAvailabilityStatusDto(status, now),
		activeThisWeek: {
			qualifies: isActiveThisWeek(evaluatedSignals),
			badgeActive: badgeDisplay.activeThisWeek,
			sinceIso: since.toISOString(),
			signals: {
				signedIn: evaluatedSignals.signedIn,
				availabilitySet: evaluatedSignals.availabilitySet,
				availabilitySetCount: availabilityCount,
				profileEdited: evaluatedSignals.profileEdited,
				messageSent: evaluatedSignals.messageSent
			}
		}
	});
}

export async function getRecentActivityCount(
	db: Database,
	providerProfileId: ProviderProfileId,
	since: Date
): Promise<number> {
	const result = await db.execute<{ count: string }>(sql`
		select count(*)::text as count
		from provider_availability.availability_history
		where provider_profile_id = ${providerProfileId}::uuid
		  and event_type in ('set', 'renewed')
		  and occurred_at >= ${since.toISOString()}::timestamptz
	`);
	const row = (result as unknown as Array<{ count: string }>)[0];
	return Number(row?.count ?? 0);
}

export type AvailabilityAnnotationEvent = {
	occurredAt: Date;
};

/** FR-ANLY-05 — availability set/renewed events for dashboard chart annotations. */
export async function listAvailabilityAnnotationEvents(
	db: Database,
	providerProfileId: ProviderProfileId,
	rangeStart: Date,
	rangeEnd: Date
): Promise<AvailabilityAnnotationEvent[]> {
	const result = await db.execute<{ occurred_at: Date }>(sql`
		select occurred_at
		from provider_availability.availability_history
		where provider_profile_id = ${providerProfileId}::uuid
		  and event_type in ('set', 'renewed')
		  and occurred_at >= ${rangeStart.toISOString()}::timestamptz
		  and occurred_at < ${rangeEnd.toISOString()}::timestamptz
		order by occurred_at asc
	`);
	const rows =
		(result as unknown as { rows?: Array<{ occurred_at: Date }> }).rows ??
		(result as unknown as Array<{ occurred_at: Date }>);
	return rows.map((row) => ({ occurredAt: new Date(row.occurred_at) }));
}
