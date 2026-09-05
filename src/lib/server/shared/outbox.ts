import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Database, Transaction } from '../db';
import { outbox, outboxDeadLetter, processedEvents } from './schema';
import type { DomainEvent } from './events';
import { EVENT_SUBSCRIBERS } from './event-catalog';
import { asId, type OutboxEventId } from './ids';
import { asInstant } from './clock';
import { queryRows } from './sql-result';

export type DbClient = Database | Transaction;

export async function publish(tx: Transaction, event: DomainEvent): Promise<void> {
	await tx.insert(outbox).values({
		eventId: event.eventId,
		eventName: event.eventName,
		version: event.version,
		occurredAt: new Date(event.occurredAt),
		correlationId: event.correlationId,
		payload: event.payload,
		publishedAt: new Date()
	});
}

export async function markProcessed(
	tx: Transaction,
	eventId: OutboxEventId,
	subscriber: string
): Promise<boolean> {
	try {
		await tx.insert(processedEvents).values({
			eventId,
			subscriber,
			processedAt: new Date()
		});
		return true;
	} catch {
		return false;
	}
}

export type UndispatchedOutboxRow = {
	eventId: OutboxEventId;
	eventName: string;
	version: number;
	occurredAt: Date;
	correlationId: string;
	payload: unknown;
	publishedAt: Date;
	attemptCount: number;
};

export async function claimUndispatched(
	db: DbClient,
	limit = 50
): Promise<UndispatchedOutboxRow[]> {
	const result = await db.execute(sql`
		with picked as (
			select event_id
			from shared.outbox
			where dispatched_at is null
			  and attempt_count < 5
			order by published_at
			limit ${limit}
			for update skip locked
		)
		update shared.outbox o
		set attempt_count = o.attempt_count + 1
		from picked
		where o.event_id = picked.event_id
		returning o.event_id, o.event_name, o.version, o.occurred_at, o.correlation_id,
			o.payload, o.published_at, o.attempt_count
	`);
	return queryRows(result).map((row) => ({
		eventId: asId<OutboxEventId['__brand']>(String(row.event_id)),
		eventName: String(row.event_name),
		version: Number(row.version),
		occurredAt: new Date(String(row.occurred_at)),
		correlationId: String(row.correlation_id),
		payload: row.payload,
		publishedAt: new Date(String(row.published_at)),
		attemptCount: Number(row.attempt_count)
	}));
}

export async function markDispatched(db: DbClient, eventId: OutboxEventId): Promise<void> {
	await db.update(outbox).set({ dispatchedAt: new Date() }).where(eq(outbox.eventId, eventId));
}

export async function listUndispatchedByCorrelationAndEvent(
	db: DbClient,
	correlationId: string,
	eventName: string
): Promise<UndispatchedOutboxRow[]> {
	const rows = await db
		.select({
			eventId: outbox.eventId,
			eventName: outbox.eventName,
			version: outbox.version,
			occurredAt: outbox.occurredAt,
			correlationId: outbox.correlationId,
			payload: outbox.payload,
			publishedAt: outbox.publishedAt,
			attemptCount: outbox.attemptCount
		})
		.from(outbox)
		.where(
			and(
				eq(outbox.correlationId, correlationId),
				eq(outbox.eventName, eventName),
				isNull(outbox.dispatchedAt)
			)
		);

	return rows.map((row) => ({
		eventId: asId<OutboxEventId['__brand']>(row.eventId),
		eventName: row.eventName,
		version: row.version,
		occurredAt: row.occurredAt,
		correlationId: row.correlationId,
		payload: row.payload,
		publishedAt: row.publishedAt,
		attemptCount: row.attemptCount
	}));
}

export async function deadLetter(
	db: DbClient,
	row: UndispatchedOutboxRow,
	subscriber: string,
	reason: string
): Promise<void> {
	await db.insert(outboxDeadLetter).values({
		eventId: row.eventId,
		eventName: row.eventName,
		version: row.version,
		occurredAt: row.occurredAt,
		correlationId: row.correlationId,
		payload: row.payload,
		publishedAt: row.publishedAt,
		subscriber,
		failedReason: reason
	});
}

export function subscribersFor(eventName: string): readonly string[] {
	if (eventName in EVENT_SUBSCRIBERS) {
		return EVENT_SUBSCRIBERS[eventName as keyof typeof EVENT_SUBSCRIBERS];
	}
	return [];
}

export function asDomainEvent(row: UndispatchedOutboxRow): DomainEvent {
	return {
		eventId: row.eventId,
		eventName: row.eventName as DomainEvent['eventName'],
		version: 1,
		occurredAt: asInstant(row.occurredAt.toISOString()),
		payload: row.payload,
		correlationId: row.correlationId
	};
}
