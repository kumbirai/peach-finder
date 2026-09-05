import type { UserId } from '../../shared/ids';
import {
	handleAvailabilityExpiryWarned,
	listUnreadInAppNotifications,
	markAvailabilityRenewalReadForOwner,
	markInAppNotificationsRead,
	dispatchUndispatchedAvailabilityExpiryWarnings,
	type InAppNotificationDto
} from './infra/notification-commands';
import { handleMessageSent, flushDueNotificationBatchWindows } from './infra/message-sent-handler';
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
	dispatchTrialEndingReminders
} from './infra/event-handlers';
import { dispatchUndispatchedNotificationSubscribers } from './infra/dev-dispatch';

export {
	handleAvailabilityExpiryWarned,
	handleMessageSent,
	flushDueNotificationBatchWindows,
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
	dispatchUndispatchedNotificationSubscribers,
	type InAppNotificationDto
};

export async function exportFor(userId: UserId): Promise<{ unreadInApp: InAppNotificationDto[] }> {
	const { getDb } = await import('../../db');
	const unreadInApp = await listUnreadInAppNotifications(getDb(), userId, 5);
	return { unreadInApp };
}
