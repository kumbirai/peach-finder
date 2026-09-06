import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Database, Transaction } from '../../../db';
import { getProfileOwnerIdDb } from '../../provider-profile';
import type { DomainEvent } from '../../../shared/events';
import { newId, type UserId } from '../../../shared/ids';
import {
	asDomainEvent,
	listUndispatchedByCorrelationAndEvent,
	markDispatched,
	markProcessed
} from '../../../shared/outbox';
import { isChannelEnabled } from './preference-commands';
import { notificationLog } from './schema';

export type InAppNotificationDto = {
	id: string;
	category: string;
	title: string;
	body: string;
	deepLinkPath: string;
	readAt: string | null;
	createdAt: string;
};

function formatExpiryTime(expiresAt: string): string {
	const date = new Date(expiresAt);
	return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export async function handleAvailabilityExpiryWarned(
	db: Database,
	event: DomainEvent<'AvailabilityExpiryWarned', { providerProfileId: string; expiresAt: string }>
): Promise<void> {
	await db.transaction(async (tx) => {
		const inserted = await markProcessed(tx, event.eventId, 'user-notifications.renewal-prompt');
		if (!inserted) return;

		const ownerId = await getProfileOwnerIdDb(tx, event.payload.providerProfileId as never);
		if (!ownerId) return;

		const expiryLabel = formatExpiryTime(event.payload.expiresAt);
		const now = new Date(event.occurredAt);

		if (!(await isChannelEnabled(tx, ownerId, 'availability_expiry_warning', 'in_app'))) {
			return;
		}

		await tx.insert(notificationLog).values({
			id: newId(),
			userId: ownerId,
			category: 'availability_expiry_warning',
			channel: 'in_app',
			status: 'sent',
			title: 'Your availability expires soon',
			body: `Your "Available now" status expires at ${expiryLabel}. Tap Still available to stay visible to seekers.`,
			deepLinkPath: '/provider/dashboard?renewAvailability=1',
			relatedEntityType: 'availability',
			relatedEntityId: null,
			readAt: null,
			dispatchedAt: now,
			createdAt: now,
			correlationId: event.correlationId
		});
	});
}

export async function listUnreadInAppNotifications(
	db: Database,
	userId: UserId,
	limit = 10
): Promise<InAppNotificationDto[]> {
	const rows = await db
		.select({
			id: notificationLog.id,
			category: notificationLog.category,
			title: notificationLog.title,
			body: notificationLog.body,
			deepLinkPath: notificationLog.deepLinkPath,
			readAt: notificationLog.readAt,
			createdAt: notificationLog.createdAt
		})
		.from(notificationLog)
		.where(
			and(
				eq(notificationLog.userId, userId),
				eq(notificationLog.channel, 'in_app'),
				isNull(notificationLog.readAt)
			)
		)
		.orderBy(desc(notificationLog.createdAt))
		.limit(limit);

	return rows.map((row) => ({
		id: row.id,
		category: row.category,
		title: row.title ?? '',
		body: row.body ?? '',
		deepLinkPath: row.deepLinkPath ?? '/provider/dashboard',
		readAt: row.readAt?.toISOString() ?? null,
		createdAt: row.createdAt.toISOString()
	}));
}

export async function markInAppNotificationsRead(
	db: Database | Transaction,
	userId: UserId,
	ids: string[],
	now: Date
): Promise<void> {
	if (ids.length === 0) return;
	for (const id of ids) {
		await db
			.update(notificationLog)
			.set({ readAt: now })
			.where(
				and(
					eq(notificationLog.id, id),
					eq(notificationLog.userId, userId),
					eq(notificationLog.channel, 'in_app'),
					isNull(notificationLog.readAt)
				)
			);
	}
}

export async function markAvailabilityRenewalReadForOwner(
	db: Database,
	userId: UserId,
	now: Date
): Promise<void> {
	await db
		.update(notificationLog)
		.set({ readAt: now })
		.where(
			and(
				eq(notificationLog.userId, userId),
				eq(notificationLog.channel, 'in_app'),
				eq(notificationLog.category, 'availability_expiry_warning'),
				isNull(notificationLog.readAt)
			)
		);
}

export async function dispatchUndispatchedAvailabilityExpiryWarnings(
	db: Database,
	correlationId: string
): Promise<number> {
	const rows = await listUndispatchedByCorrelationAndEvent(
		db,
		correlationId,
		'AvailabilityExpiryWarned'
	);

	for (const row of rows) {
		await handleAvailabilityExpiryWarned(db, asDomainEvent(row) as never);
		await markDispatched(db, row.eventId);
	}

	return rows.length;
}
