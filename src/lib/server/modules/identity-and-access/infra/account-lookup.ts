import { and, eq, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { Database } from '../../../db';
import type { UserId } from '../../../shared/ids';
import { asId } from '../../../shared/ids';
import { ownsProfileDb } from '../../provider-profile';
import { users } from './schema';

export type AccountSearchHit = {
	userId: UserId;
	displayName: string;
	email: string | null;
	phone: string | null;
};

export type AccountSummary = {
	userId: UserId;
	displayName: string;
	email: string | null;
	emailVerified: boolean;
	phone: string | null;
	phoneVerified: boolean;
	status: 'active' | 'suspended' | 'deleted';
	isAdmin: boolean;
	isProvider: boolean;
	createdAt: string;
};

const SEARCH_LIMIT = 25;

export function escapeLikePattern(raw: string): string {
	return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function ilikeContains(column: AnyPgColumn, raw: string): SQL {
	const pattern = `%${escapeLikePattern(raw)}%`;
	return sql`${column} ILIKE ${pattern} ESCAPE '\\'`;
}

function normalizePhoneQuery(query: string): string {
	return query.replace(/[\s\-()]/g, '');
}

function isPhoneLike(query: string): boolean {
	return /^[\d+\s\-()]+$/.test(query);
}

function phoneMatchCondition(phoneQuery: string): SQL {
	if (phoneQuery.length < 4) return sql`false`;
	const e164 = phoneQuery.startsWith('+') ? phoneQuery : `+${phoneQuery}`;
	return or(eq(users.phone, e164), ilikeContains(users.phone, phoneQuery)) ?? sql`false`;
}

export async function searchAccounts(db: Database, query: string): Promise<AccountSearchHit[]> {
	const trimmed = query.trim();
	if (trimmed.length < 2) return [];

	const phoneQuery = normalizePhoneQuery(trimmed);
	const matchConditions: SQL[] = [
		ilikeContains(users.displayName, trimmed),
		ilikeContains(users.email, trimmed)
	];

	if (isPhoneLike(trimmed)) {
		matchConditions.push(phoneMatchCondition(phoneQuery));
	}

	const rows = await db
		.select({
			id: users.id,
			displayName: users.displayName,
			email: users.email,
			phone: users.phone
		})
		.from(users)
		.where(and(isNull(users.anonymizedAt), ne(users.status, 'deleted'), or(...matchConditions)))
		.limit(SEARCH_LIMIT);

	return rows.map((row) => ({
		userId: asId<'UserId'>(row.id),
		displayName: row.displayName,
		email: row.email,
		phone: row.phone
	}));
}

export async function getAccountSummary(
	db: Database,
	userId: UserId
): Promise<AccountSummary | null> {
	const rows = await db
		.select({
			id: users.id,
			displayName: users.displayName,
			email: users.email,
			emailVerifiedAt: users.emailVerifiedAt,
			phone: users.phone,
			phoneVerifiedAt: users.phoneVerifiedAt,
			status: users.status,
			isAdmin: users.isAdmin,
			createdAt: users.createdAt,
			anonymizedAt: users.anonymizedAt
		})
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	const row = rows[0];
	if (!row || row.anonymizedAt !== null || row.status === 'deleted') return null;

	const isProvider = row.isAdmin ? false : await ownsProfileDb(db, userId);

	return {
		userId: asId<'UserId'>(row.id),
		displayName: row.displayName,
		email: row.email,
		emailVerified: row.emailVerifiedAt !== null,
		phone: row.phone,
		phoneVerified: row.phoneVerifiedAt !== null,
		status: row.status as AccountSummary['status'],
		isAdmin: row.isAdmin,
		isProvider,
		createdAt: row.createdAt.toISOString()
	};
}
