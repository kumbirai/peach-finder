import { and, desc, eq, lt, or } from 'drizzle-orm';
import type { Database } from '../../../db';
import { getDisplayIdentity } from '../../identity-and-access';
import { decodeCursor, encodeCursor } from '../../../shared/api';
import { auditLog } from '../../../shared/schema';
import { asId } from '../../../shared/ids';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

export type AuditLogFilters = {
	targetType: string;
	targetId: string;
};

export type AuditLogEntryDto = {
	id: string;
	occurredAt: string;
	actorId: string | null;
	actorDisplayName: string;
	actorRole: string;
	action: string;
	targetType: string;
	targetId: string;
	reason: string | null;
	metadata: Record<string, unknown>;
	correlationId: string;
};

export type ReadAuditLogOptions = {
	cursor?: string;
	limit?: number;
};

export type ReadAuditLogResult = {
	entries: AuditLogEntryDto[];
	nextCursor: string | null;
};

function parseLimit(raw: number | undefined): number {
	if (raw == null || Number.isNaN(raw)) return DEFAULT_LIMIT;
	return Math.min(Math.max(1, Math.floor(raw)), MAX_LIMIT);
}

function parseAuditCursor(
	cursor: Record<string, string | number> | null
): { occurredAt: Date; id: string } | null {
	if (!cursor?.occurredAt || !cursor?.id) return null;
	const occurredAt = new Date(String(cursor.occurredAt));
	if (Number.isNaN(occurredAt.getTime())) return null;
	const id = String(cursor.id);
	return id ? { occurredAt, id } : null;
}

export function isValidAuditCursor(cursor: string): boolean {
	return parseAuditCursor(decodeCursor(cursor)) != null;
}

export async function readAuditLog(
	db: Database,
	filters: AuditLogFilters,
	options: ReadAuditLogOptions = {}
): Promise<ReadAuditLogResult> {
	const limit = parseLimit(options.limit);
	const cursor = parseAuditCursor(options.cursor ? decodeCursor(options.cursor) : null);

	let whereClause = and(
		eq(auditLog.targetType, filters.targetType),
		eq(auditLog.targetId, filters.targetId)
	);
	if (cursor) {
		whereClause = and(
			eq(auditLog.targetType, filters.targetType),
			eq(auditLog.targetId, filters.targetId),
			or(
				lt(auditLog.occurredAt, cursor.occurredAt),
				and(eq(auditLog.occurredAt, cursor.occurredAt), lt(auditLog.id, cursor.id))
			)
		)!;
	}

	const rows = await db
		.select()
		.from(auditLog)
		.where(whereClause)
		.orderBy(desc(auditLog.occurredAt), desc(auditLog.id))
		.limit(limit + 1);

	const page = rows.slice(0, limit);
	const hasMore = rows.length > limit;

	const actorIds = [
		...new Set(page.map((row) => row.actorId).filter((id): id is string => id != null))
	];
	const actorNames = new Map<string, string>();
	for (const actorId of actorIds) {
		const who = await getDisplayIdentity(db, asId<'UserId'>(actorId));
		actorNames.set(actorId, who.displayName);
	}

	const entries: AuditLogEntryDto[] = page.map((row) => ({
		id: row.id,
		occurredAt: row.occurredAt.toISOString(),
		actorId: row.actorId,
		actorDisplayName:
			row.actorId == null
				? row.actorRole === 'system'
					? 'System'
					: 'Unknown actor'
				: (actorNames.get(row.actorId) ?? 'Unknown actor'),
		actorRole: row.actorRole,
		action: row.action,
		targetType: row.targetType,
		targetId: row.targetId,
		reason: row.reason,
		metadata: (row.metadata ?? {}) as Record<string, unknown>,
		correlationId: row.correlationId
	}));

	const last = page[page.length - 1];
	const nextCursor =
		hasMore && last
			? encodeCursor({
					occurredAt: last.occurredAt.toISOString(),
					id: last.id
				})
			: null;

	return { entries, nextCursor };
}
