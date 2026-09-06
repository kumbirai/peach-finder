import { and, eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { UserId } from '../../../shared/ids';
import { actionLabelForCategory, profileDeepLinkPath } from '../domain/notification-routing';
import { notificationLog } from './schema';
import { markInAppNotificationsRead } from './notification-commands';

export type InAppNotificationOpenResult =
	{ ok: true; deepLinkPath: string } | { ok: false; reason: 'not_found' };

export async function openInAppNotification(
	db: Database,
	userId: UserId,
	notificationId: string,
	now: Date
): Promise<InAppNotificationOpenResult> {
	const [row] = await db
		.select({
			id: notificationLog.id,
			deepLinkPath: notificationLog.deepLinkPath,
			category: notificationLog.category
		})
		.from(notificationLog)
		.where(
			and(
				eq(notificationLog.id, notificationId),
				eq(notificationLog.userId, userId),
				eq(notificationLog.channel, 'in_app')
			)
		)
		.limit(1);

	if (!row) {
		return { ok: false, reason: 'not_found' };
	}

	await markInAppNotificationsRead(db, userId, [notificationId], now);

	return {
		ok: true,
		deepLinkPath: row.deepLinkPath ?? profileDeepLinkPath()
	};
}

export function actionLabelForNotification(category: string, deepLinkPath: string): string {
	if (category === 'identity_outcome') {
		return actionLabelForCategory(category, {
			verificationDecision: deepLinkPath.includes('/verify') ? 'rejected' : 'approved'
		});
	}
	return actionLabelForCategory(category);
}
