import { and, gte, lt, sql } from 'drizzle-orm';
import type { Database } from '../../../db';
import { users } from './schema';

export type DateRange = {
	from: Date;
	to: Date;
};

export type RegistrationStats = {
	count: number;
};

export async function getRegistrationStats(
	db: Database,
	range: DateRange
): Promise<RegistrationStats> {
	const result = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(users)
		.where(and(gte(users.createdAt, range.from), lt(users.createdAt, range.to)));

	return { count: result[0]?.count ?? 0 };
}
