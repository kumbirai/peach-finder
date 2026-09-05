import type { UserId } from '../../shared/ids';
import {
	handleAvailabilityExpiryWarned,
	listUnreadInAppNotifications,
	markAvailabilityRenewalReadForOwner,
	markInAppNotificationsRead,
	dispatchUndispatchedAvailabilityExpiryWarnings,
	type InAppNotificationDto
} from './infra/notification-commands';

export {
	handleAvailabilityExpiryWarned,
	listUnreadInAppNotifications,
	markAvailabilityRenewalReadForOwner,
	markInAppNotificationsRead,
	dispatchUndispatchedAvailabilityExpiryWarnings,
	type InAppNotificationDto
};

export async function exportFor(userId: UserId): Promise<{ unreadInApp: InAppNotificationDto[] }> {
	const { getDb } = await import('../../db');
	const unreadInApp = await listUnreadInAppNotifications(getDb(), userId, 5);
	return { unreadInApp };
}
