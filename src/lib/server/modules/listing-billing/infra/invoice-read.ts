import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { InvoiceId, ProviderProfileId } from '../../../shared/ids';
import { decodeCursor, encodeCursor } from '../../../shared/api';
import type { InvoiceLineItem, InvoiceStatus } from '../domain/invoice';
import { invoices } from './schema';

export type InvoiceRow = {
	id: InvoiceId;
	providerProfileId: ProviderProfileId;
	lineItem: InvoiceLineItem;
	amountCents: number;
	currency: 'ZAR';
	status: InvoiceStatus;
	pspInvoiceRef: string | null;
	issuedAt: string;
	paidAt: string | null;
};

export async function listInvoicesForProfile(
	db: Database,
	providerProfileId: ProviderProfileId,
	input: { cursor: string | null; limit: number }
): Promise<{ items: InvoiceRow[]; nextCursor: string | null }> {
	const limit = Math.min(Math.max(input.limit, 1), 50);
	const conditions = [eq(invoices.providerProfileId, providerProfileId)];

	if (input.cursor) {
		const decoded = decodeCursor(input.cursor);
		const issuedAt = decoded?.issuedAt;
		const id = decoded?.id;
		if (typeof issuedAt === 'string' && typeof id === 'string') {
			const cursorDate = new Date(issuedAt);
			conditions.push(
				or(
					lt(invoices.issuedAt, cursorDate),
					and(eq(invoices.issuedAt, cursorDate), lt(invoices.id, id))
				)!
			);
		}
	}

	const rows = await db
		.select()
		.from(invoices)
		.where(and(...conditions))
		.orderBy(desc(invoices.issuedAt), desc(invoices.id))
		.limit(limit + 1);

	const hasMore = rows.length > limit;
	const page = rows.slice(0, limit);

	return {
		items: page.map(mapInvoiceRow),
		nextCursor:
			hasMore && page.length > 0
				? encodeCursor({
						issuedAt: page[page.length - 1]!.issuedAt.toISOString(),
						id: page[page.length - 1]!.id
					})
				: null
	};
}

export async function insertInvoice(
	db: Database,
	input: {
		id: InvoiceId;
		providerProfileId: ProviderProfileId;
		lineItem: InvoiceLineItem;
		amountCents: number;
		status: InvoiceStatus;
		pspInvoiceRef?: string | null;
		issuedAt?: Date;
		paidAt?: Date | null;
	}
): Promise<void> {
	await db.insert(invoices).values({
		id: input.id,
		providerProfileId: input.providerProfileId,
		lineItem: input.lineItem,
		amountCents: input.amountCents,
		currency: 'ZAR',
		status: input.status,
		pspInvoiceRef: input.pspInvoiceRef ?? null,
		issuedAt: input.issuedAt ?? new Date(),
		paidAt: input.paidAt ?? null
	});
}

export async function countInvoicesForProfile(
	db: Database,
	providerProfileId: ProviderProfileId
): Promise<number> {
	const result = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(invoices)
		.where(eq(invoices.providerProfileId, providerProfileId));
	return result[0]?.count ?? 0;
}

function mapInvoiceRow(row: typeof invoices.$inferSelect): InvoiceRow {
	return {
		id: row.id as InvoiceId,
		providerProfileId: row.providerProfileId as ProviderProfileId,
		lineItem: row.lineItem as InvoiceLineItem,
		amountCents: row.amountCents,
		currency: 'ZAR',
		status: row.status as InvoiceStatus,
		pspInvoiceRef: row.pspInvoiceRef,
		issuedAt: row.issuedAt.toISOString(),
		paidAt: row.paidAt?.toISOString() ?? null
	};
}
