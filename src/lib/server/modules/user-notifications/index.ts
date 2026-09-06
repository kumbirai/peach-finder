import type { UserId } from '../../shared/ids';
import {
	handleAvailabilityExpiryWarned,
	listUnreadInAppNotifications,
	markAvailabilityRenewalReadForOwner,
	markInAppNotificationsRead,
	dispatchUndispatchedAvailabilityExpiryWarnings,
	type InAppNotificationDto
} from './infra/notification-commands';
import {
	getNotificationPreferences,
	updateNotificationPreferences,
	type NotificationPreferencesDto,
	type PreferenceUpdate
} from './infra/preference-commands';
import {
	handleMessageSent,
	flushDueNotificationBatchWindows,
	forceFlushOpenNotificationBatchWindows
} from './infra/message-sent-handler';
import { handleUserBlocked, handleUserUnblocked } from './infra/subscriptions';
import {
	handleUserRegistered,
	handleVerificationDecided,
	handleReviewSubmitted,
	handleReportFiled,
	handleReportResolved,
	handleModerationActionTaken,
	handlePaymentSucceeded,
	handlePaymentFailed,
	handleGraceEntered,
	handleListingLapsed,
	dispatchTrialEndingReminders,
	dispatchGraceDunningReminder
} from './infra/event-handlers';
import {
	dispatchUndispatchedNotificationSubscribers,
	catchUpMessageSentNotificationLedger
} from './infra/dev-dispatch';

export {
	handleAvailabilityExpiryWarned,
	handleMessageSent,
	flushDueNotificationBatchWindows,
	forceFlushOpenNotificationBatchWindows,
	listUnreadInAppNotifications,
	markAvailabilityRenewalReadForOwner,
	markInAppNotificationsRead,
	dispatchUndispatchedAvailabilityExpiryWarnings,
	handleUserBlocked,
	handleUserUnblocked,
	handleUserRegistered,
	handleVerificationDecided,
	handleReviewSubmitted,
	handleReportFiled,
	handleReportResolved,
	handleModerationActionTaken,
	handlePaymentSucceeded,
	handlePaymentFailed,
	handleGraceEntered,
	handleListingLapsed,
	dispatchTrialEndingReminders,
	dispatchGraceDunningReminder,
	dispatchUndispatchedNotificationSubscribers,
	catchUpMessageSentNotificationLedger,
	getNotificationPreferences,
	updateNotificationPreferences,
	type InAppNotificationDto,
	type NotificationPreferencesDto,
	type PreferenceUpdate
};

export async function exportFor(
	userId: UserId
): Promise<{ unreadInApp: InAppNotificationDto[]; preferences: NotificationPreferencesDto }> {
	const { getDb } = await import('../../db');
	const db = getDb();
	const [unreadInApp, preferences] = await Promise.all([
		listUnreadInAppNotifications(db, userId, 5),
		getNotificationPreferences(db, userId)
	]);
	return { unreadInApp, preferences };
}
