import { and, desc, eq, lt, or } from 'drizzle-orm';
import type { Database } from '../../../db';
import type { ProviderProfileId } from '../../../shared/ids';
import { asId } from '../../../shared/ids';
import { getDisplayIdentity } from '../../identity-and-access';
import { decodeCursor, encodeCursor } from '../../../shared/api';
import { toPublicReview, type PublicReviewDto } from './serializers';
import { reviews } from './schema';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export type ListPublicReviewsOptions = {
	limit?: number;
	cursor?: string;
};

export type ListPublicReviewsResult = {
	reviews: PublicReviewDto[];
	nextCursor: string | null;
};

function parseLimit(raw: number | undefined): number {
	if (raw == null || Number.isNaN(raw)) return DEFAULT_LIMIT;
	return Math.min(Math.max(1, Math.floor(raw)), MAX_LIMIT);
}

function parseReviewCursor(
	cursor: Record<string, string | number> | null
): { createdAt: Date; id: string } | null {
	if (!cursor?.createdAt || !cursor?.id) return null;
	const createdAt = new Date(String(cursor.createdAt));
	if (Number.isNaN(createdAt.getTime())) return null;
	const id = String(cursor.id);
	return id ? { createdAt, id } : null;
}

export async function listPublicReviewsForProvider(
	db: Database,
	providerProfileId: ProviderProfileId,
	options: ListPublicReviewsOptions = {}
): Promise<ListPublicReviewsResult> {
	const limit = parseLimit(options.limit);
	const cursor = parseReviewCursor(options.cursor ? decodeCursor(options.cursor) : null);

	let whereClause = eq(reviews.providerProfileId, providerProfileId);
	if (cursor) {
		whereClause = and(
			eq(reviews.providerProfileId, providerProfileId),
			or(
				lt(reviews.createdAt, cursor.createdAt),
				and(eq(reviews.createdAt, cursor.createdAt), lt(reviews.id, cursor.id))
			)
		)!;
	}

	const rows = await db
		.select({
			id: reviews.id,
			rating: reviews.rating,
			body: reviews.body,
			isEdited: reviews.isEdited,
			replyBody: reviews.replyBody,
			createdAt: reviews.createdAt,
			reviewerId: reviews.reviewerId
		})
		.from(reviews)
		.where(whereClause)
		.orderBy(desc(reviews.createdAt), desc(reviews.id))
		.limit(limit + 1);

	const page = rows.slice(0, limit);
	const hasMore = rows.length > limit;

	const reviewerIds = [...new Set(page.map((row) => row.reviewerId))];
	const reviewerNames = new Map<string, string>();
	for (const reviewerId of reviewerIds) {
		const who = await getDisplayIdentity(db, asId<'UserId'>(reviewerId));
		reviewerNames.set(reviewerId, who.isDeleted ? 'Former user' : who.displayName);
	}

	const publicReviews = page.map((row) =>
		toPublicReview({
			id: row.id,
			rating: row.rating,
			body: row.body,
			isEdited: row.isEdited,
			replyBody: row.replyBody,
			createdAt: row.createdAt,
			reviewerDisplayName: reviewerNames.get(row.reviewerId) ?? 'Former user'
		})
	);

	const last = page[page.length - 1];
	const nextCursor =
		hasMore && last
			? encodeCursor({
					createdAt: last.createdAt.toISOString(),
					id: last.id
				})
			: null;

	return { reviews: publicReviews, nextCursor };
}
