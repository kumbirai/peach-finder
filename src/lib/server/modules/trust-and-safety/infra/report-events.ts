import type { Transaction } from '../../../db';
import { asInstant } from '../../../shared/clock';
import type { DomainEvent } from '../../../shared/events';
import { newId, type ReportId } from '../../../shared/ids';
import { publish } from '../../../shared/outbox';

export async function publishReportResolved(
	tx: Transaction,
	input: {
		reportId: ReportId;
		resolution: 'dismissed' | 'acted';
		correlationId: string;
		now: Date;
	}
): Promise<void> {
	const event: DomainEvent<'ReportResolved', { reportId: string; resolution: string }> = {
		eventId: newId<'OutboxEventId'>(),
		eventName: 'ReportResolved',
		version: 1,
		occurredAt: asInstant(input.now.toISOString()),
		correlationId: input.correlationId,
		payload: {
			reportId: input.reportId,
			resolution: input.resolution
		}
	};
	await publish(tx, event);
}
