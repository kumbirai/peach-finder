import { sql } from 'drizzle-orm';
import type { Database } from '../../../db';
import { getConfig } from '../../platform-configuration';
import { mirrorAvailabilityOnProjection } from '../../discovery-search';
import type { DomainEvent } from '../../../shared/events';
import { newId, type ProviderProfileId } from '../../../shared/ids';
import { asInstant } from '../../../shared/clock';
import { publish } from '../../../shared/outbox';
import { queryRows } from '../../../shared/sql-result';

export type AvailabilityTickResult = {
	warned: Array<{ providerProfileId: ProviderProfileId; expiresAt: string }>;
	expired: ProviderProfileId[];
};

function reminderLeadMinutesFromConfig(): number {
	return getConfig('provider-availability.reminder_lead_minutes');
}

export async function runAvailabilityWarningTick(
	db: Database,
	now: Date,
	correlationId: string
): Promise<Array<{ providerProfileId: ProviderProfileId; expiresAt: string }>> {
	const leadMinutes = reminderLeadMinutesFromConfig();
	const nowIso = now.toISOString();

	return db.transaction(async (tx) => {
		const result = await tx.execute(sql`
			with warned as (
				update provider_availability.availability_status
				   set state      = 'expiry_warned',
				       warned_at  = ${nowIso}::timestamptz,
				       updated_at = ${nowIso}::timestamptz
				 where state = 'available'
				   and warned_at is null
				   and expires_at > ${nowIso}::timestamptz
				   and expires_at <= ${nowIso}::timestamptz + make_interval(mins => ${leadMinutes})
				returning provider_profile_id, expires_at
			),
			history as (
				insert into provider_availability.availability_history (
					id, provider_profile_id, event_type, occurred_at, correlation_id
				)
				select gen_random_uuid(), provider_profile_id, 'warned', ${nowIso}::timestamptz, ${correlationId}
				from warned
				returning provider_profile_id
			)
			select w.provider_profile_id, w.expires_at
			from warned w
		`);

		const warnedRows = queryRows(result) as Array<{
			provider_profile_id: string;
			expires_at: string;
		}>;
		const warned: Array<{ providerProfileId: ProviderProfileId; expiresAt: string }> = [];

		for (const row of warnedRows) {
			const providerProfileId = row.provider_profile_id as ProviderProfileId;
			const expiresAt = new Date(row.expires_at).toISOString();
			const event: DomainEvent<
				'AvailabilityExpiryWarned',
				{ providerProfileId: string; expiresAt: string }
			> = {
				eventId: newId(),
				eventName: 'AvailabilityExpiryWarned',
				version: 1,
				occurredAt: asInstant(now.toISOString()),
				correlationId,
				payload: {
					providerProfileId,
					expiresAt
				}
			};
			await publish(tx, event);
			warned.push({ providerProfileId, expiresAt });
		}

		return warned;
	});
}

export async function runAvailabilityExpirySweep(
	db: Database,
	now: Date,
	correlationId: string
): Promise<ProviderProfileId[]> {
	const nowIso = now.toISOString();

	return db.transaction(async (tx) => {
		const result = await tx.execute(sql`
			with expired as (
				update provider_availability.availability_status
				   set state      = 'not_available',
				       set_at     = null,
				       expires_at = null,
				       warned_at  = null,
				       updated_at = ${nowIso}::timestamptz
				 where state in ('available', 'expiry_warned')
				   and expires_at <= ${nowIso}::timestamptz
				returning provider_profile_id
			)
			insert into provider_availability.availability_history (
				id, provider_profile_id, event_type, occurred_at, correlation_id
			)
			select gen_random_uuid(), provider_profile_id, 'expired', ${nowIso}::timestamptz, ${correlationId}
			from expired
			returning provider_profile_id
		`);

		const expiredRows = queryRows(result) as Array<{ provider_profile_id: string }>;
		const expired: ProviderProfileId[] = [];

		for (const row of expiredRows) {
			const providerProfileId = row.provider_profile_id as ProviderProfileId;
			const event: DomainEvent<
				'AvailabilityExpired',
				{ providerProfileId: string; expiredAt: string }
			> = {
				eventId: newId(),
				eventName: 'AvailabilityExpired',
				version: 1,
				occurredAt: asInstant(now.toISOString()),
				correlationId,
				payload: {
					providerProfileId,
					expiredAt: now.toISOString()
				}
			};
			await publish(tx, event);
			await mirrorAvailabilityOnProjection(tx, providerProfileId, 'not_available', null, now);
			expired.push(providerProfileId);
		}

		return expired;
	});
}

export async function runAvailabilityLifecycleTick(
	db: Database,
	now: Date,
	correlationId: string
): Promise<AvailabilityTickResult> {
	const warned = await runAvailabilityWarningTick(db, now, correlationId);
	const expired = await runAvailabilityExpirySweep(db, now, correlationId);
	return { warned, expired };
}
