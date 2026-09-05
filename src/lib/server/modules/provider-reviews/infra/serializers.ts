export type PublicReviewDto = {
	id: string;
	rating: number;
	body: string;
	reviewerName: string;
	dateLabel: string;
	isEdited: boolean;
	providerReply: { body: string } | null;
};

export function abbreviateReviewerName(displayName: string): string {
	const trimmed = displayName.trim();
	if (!trimmed || trimmed === 'Former user') return 'Former user';
	const parts = trimmed.split(/\s+/);
	const first = parts[0] ?? 'Anonymous';
	if (parts.length <= 1) return first;
	const lastInitial = parts[parts.length - 1]![0];
	return lastInitial ? `${first} ${lastInitial}.` : first;
}

export function formatPublicReviewDate(createdAt: Date): string {
	return createdAt.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
}

export function toPublicReview(input: {
	id: string;
	rating: number;
	body: string | null;
	isEdited: boolean;
	replyBody: string | null;
	createdAt: Date;
	reviewerDisplayName: string;
}): PublicReviewDto {
	return {
		id: input.id,
		rating: input.rating,
		body: input.body ?? '',
		reviewerName: abbreviateReviewerName(input.reviewerDisplayName),
		dateLabel: formatPublicReviewDate(input.createdAt),
		isEdited: input.isEdited,
		providerReply: input.replyBody ? { body: input.replyBody } : null
	};
}
