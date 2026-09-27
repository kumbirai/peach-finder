import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { seedCore, SEED_DUAL_ROLE_USER_ID } from '../../../../../scripts/seed-core';
import { withTestDatabase } from '../../db/test-harness';
import { asId } from '../../shared/ids';
import { setEmailSenderForTests, type EmailMessage } from '../../shared/mailer';
import { seedPlatform, loadConfigCache } from '../platform-configuration';
import { recordNotification } from './infra/dispatch';
import { notificationLog } from './infra/schema';

describe('notification SMTP delivery', () => {
	it('sends the email channel through the mailer before logging sent', async () => {
		const delivered: EmailMessage[] = [];
		setEmailSenderForTests({
			async send(message) {
				delivered.push(message);
			}
		});
		try {
			await withTestDatabase(async (db) => {
				await seedPlatform(db);
				await loadConfigCache(db);
				await seedCore(db);
				const userId = asId<'UserId'>(SEED_DUAL_ROLE_USER_ID);

				await db.transaction(async (tx) => {
					await recordNotification(tx, {
						userId,
						category: 'account_welcome',
						channels: ['email'],
						title: 'Welcome to Peach Finder',
						body: 'Your account is ready.',
						deepLinkPath: '/',
						correlationId: 'smtp-welcome',
						now: new Date()
					});
				});

				expect(delivered).toHaveLength(1);
				expect(delivered[0]?.to).toBe('dual@example.com');
				expect(delivered[0]?.subject).toBe('Welcome to Peach Finder');
				expect(delivered[0]?.text).toContain('Your account is ready.');
				expect(delivered[0]?.html).toContain('Open in Peach Finder');

				const rows = await db
					.select({ channel: notificationLog.channel, status: notificationLog.status })
					.from(notificationLog)
					.where(eq(notificationLog.correlationId, 'smtp-welcome'));
				expect(rows).toEqual([{ channel: 'email', status: 'sent' }]);
			});
		} finally {
			setEmailSenderForTests(null);
		}
	}, 90_000);
});
