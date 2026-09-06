import { and, asc, eq } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { ReportId, ThreadId, UserId } from '../../../shared/ids';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { getDisplayIdentity } from '../../identity-and-access';
import { getProfileOwnerDisplayName } from '../../provider-profile';
import { reports } from '../../trust-and-safety/infra/schema';
import { messages, threads } from './schema';

export type ReportThreadMessage = {
	senderDisplayName: string;
	body: string;
	sentAt: string;
};

export async function listThreadMessagesForReport(
	db: Database,
	threadId: ThreadId,
	reportId: ReportId
): Promise<Result<ReportThreadMessage[], UseCaseError>> {
	const reportRows = await db
		.select()
		.from(reports)
		.where(
			and(
				eq(reports.id, reportId),
				eq(reports.targetType, 'thread'),
				eq(reports.targetId, threadId)
			)
		)
		.limit(1);
	if (!reportRows[0]) {
		return Err({ kind: 'not_found', resource: 'thread' });
	}

	const threadRows = await db
		.select({
			seekerId: threads.seekerId,
			providerProfileId: threads.providerProfileId
		})
		.from(threads)
		.where(eq(threads.id, threadId))
		.limit(1);
	const thread = threadRows[0];
	if (!thread) {
		return Err({ kind: 'not_found', resource: 'thread' });
	}

	const providerDisplayName = await getProfileOwnerDisplayName(
		db,
		thread.providerProfileId as never
	);

	const rows = await db
		.select()
		.from(messages)
		.where(eq(messages.threadId, threadId))
		.orderBy(asc(messages.sentAt));

	const result: ReportThreadMessage[] = [];
	for (const row of rows) {
		const senderId = row.senderId as UserId;
		let senderDisplayName: string;
		if (senderId === thread.seekerId) {
			const identity = await getDisplayIdentity(db, senderId);
			senderDisplayName = identity.displayName;
		} else {
			senderDisplayName = providerDisplayName;
		}
		result.push({
			senderDisplayName,
			body: row.body,
			sentAt: row.sentAt.toISOString()
		});
	}

	return Ok(result);
}
