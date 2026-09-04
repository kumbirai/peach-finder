import type { Transaction } from '../db';
import { auditLog } from './schema';
import { newId, type AuditLogEntryId, type UserId } from './ids';
import type { AuditActorRole } from './schema';

export type AuditEntry = {
	actorId: UserId | null;
	actorRole: AuditActorRole;
	action: string;
	targetType: string;
	targetId: string;
	reason?: string | null;
	metadata?: Record<string, unknown>;
	correlationId: string;
};

export async function writeAudit(tx: Transaction, entry: AuditEntry): Promise<AuditLogEntryId> {
	const id = newId<AuditLogEntryId['__brand']>();
	await tx.insert(auditLog).values({
		id,
		occurredAt: new Date(),
		actorId: entry.actorId,
		actorRole: entry.actorRole,
		action: entry.action,
		targetType: entry.targetType,
		targetId: entry.targetId,
		reason: entry.reason ?? null,
		metadata: entry.metadata ?? {},
		correlationId: entry.correlationId
	});
	return id;
}
