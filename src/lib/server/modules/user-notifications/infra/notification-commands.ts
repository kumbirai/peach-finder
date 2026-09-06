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
import {
	availabilityExpiryCopy,
	availabilityRenewalDeepLinkPath,
	profileDeepLinkPath
} from '../domain/notification-routing';
import { actionLabelForNotification } from './in-app-open';
import { isChannelEnabled } from './preference-commands';
import { notificationLog } from './schema';

export type InAppNotificationDto = {
	id: string;
	category: string;
	title: string;
	body: string;
	deepLinkPath: string;
	actionLabel: string;
	openHref: string;
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
		const expiryCopy = availabilityExpiryCopy(expiryLabel);

		if (!(await isChannelEnabled(tx, ownerId, 'availability_expiry_warning', 'in_app'))) {
			return;
		}

		await tx.insert(notificationLog).values({
			id: newId(),
			userId: ownerId,
			category: 'availability_expiry_warning',
			channel: 'in_app',
			status: 'sent',
			title: expiryCopy.title,
			body: expiryCopy.body,
			deepLinkPath: availabilityRenewalDeepLinkPath(),
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

	return rows.map((row) => {
		const deepLinkPath = row.deepLinkPath ?? profileDeepLinkPath();
		return {
			id: row.id,
			category: row.category,
			title: row.title ?? '',
			body: row.body ?? '',
			deepLinkPath,
			actionLabel: actionLabelForNotification(row.category, deepLinkPath),
			openHref: `/api/notifications/in-app/${row.id}/open`,
			readAt: row.readAt?.toISOString() ?? null,
			createdAt: row.createdAt.toISOString()
		};
	});
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
