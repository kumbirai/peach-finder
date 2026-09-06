import { sql } from 'drizzle-orm';
import type { Database } from '../../../db';
import { newId, type AnalyticsEventId, type ProviderProfileId } from '../../../shared/ids';
import { swallowCapture } from './capture-metrics';

export type RawEventType =
	| 'profile_view'
	| 'search_appearance'
	| 'contact_request'
	| 'tap_to_call'
	| 'search_filter_applied';

async function insertRawEvent(
	db: Database,
	input: {
		eventType: RawEventType;
		providerProfileId: ProviderProfileId | null;
		viewerKey: string | null;
		occurredAt: Date;
		metadata?: Record<string, unknown>;
	}
): Promise<void> {
	const id = newId<'AnalyticsEventId'>() as AnalyticsEventId;
	await db.execute(sql`
		INSERT INTO provider_analytics.raw_event (
			id, event_type, provider_profile_id, viewer_key, occurred_at, metadata
		) VALUES (
			${id}::uuid,
			${input.eventType},
			${input.providerProfileId}::uuid,
			${input.viewerKey},
			${input.occurredAt.toISOString()}::timestamptz,
			${JSON.stringify(input.metadata ?? {})}::jsonb
		)
		ON CONFLICT DO NOTHING
	`);
}

export async function captureView(
	db: Database,
	providerProfileId: ProviderProfileId,
	viewerKey: string,
	occurredAt = new Date()
): Promise<void> {
	await swallowCapture('profile_view', () =>
		insertRawEvent(db, {
			eventType: 'profile_view',
			providerProfileId,
			viewerKey,
			occurredAt
		})
	);
}

export async function captureAppearance(
	db: Database,
	providerProfileIds: ProviderProfileId[],
	viewerKey: string,
	occurredAt = new Date()
): Promise<void> {
	if (providerProfileIds.length === 0) return;
	await swallowCapture('search_appearance', async () => {
		for (const providerProfileId of providerProfileIds) {
			await insertRawEvent(db, {
				eventType: 'search_appearance',
				providerProfileId,
				viewerKey,
				occurredAt
			});
		}
	});
}

export async function captureFilterUsage(
	db: Database,
	serviceTagIds: string[],
	occurredAt = new Date()
): Promise<void> {
	if (serviceTagIds.length === 0) return;
	await swallowCapture('search_filter_applied', () =>
		insertRawEvent(db, {
			eventType: 'search_filter_applied',
			providerProfileId: null,
			viewerKey: null,
			occurredAt,
			metadata: { serviceTagIds }
		})
	);
}

export async function captureContactRequest(
	db: Database,
	providerProfileId: ProviderProfileId,
	occurredAt = new Date()
): Promise<void> {
	await swallowCapture('contact_request', () =>
		insertRawEvent(db, {
			eventType: 'contact_request',
			providerProfileId,
			viewerKey: null,
			occurredAt
		})
	);
}

export async function captureTapToCall(
	db: Database,
	providerProfileId: ProviderProfileId,
	occurredAt = new Date()
): Promise<void> {
	await swallowCapture('tap_to_call', () =>
		insertRawEvent(db, {
			eventType: 'tap_to_call',
			providerProfileId,
			viewerKey: null,
			occurredAt
		})
	);
}
