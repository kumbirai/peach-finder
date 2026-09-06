export type PublicReviewDto = {
	id: string;
	rating: number;
	body: string;
	reviewerName: string;
	dateLabel: string;
	isEdited: boolean;
	providerReply: { body: string } | null;
};

export type OwnReviewDto = {
	id: string;
	providerProfileId: string;
	rating: number;
	body: string | null;
	isEdited: boolean;
	createdAt: string;
};

export type ReviewEligibilityDto = {
	eligible: boolean;
	reason?: string;
};

export function toEligibility(state: { eligible: boolean; reason?: string }): ReviewEligibilityDto {
	if (state.eligible) {
		return { eligible: true };
	}
	return state.reason ? { eligible: false, reason: state.reason } : { eligible: false };
}

export function toOwnReview(input: {
	id: string;
	providerProfileId: string;
	rating: number;
	body: string | null;
	isEdited: boolean;
	createdAt: Date;
}): OwnReviewDto {
	return {
		id: input.id,
		providerProfileId: input.providerProfileId,
		rating: input.rating,
		body: input.body,
		isEdited: input.isEdited,
		createdAt: input.createdAt.toISOString()
	};
}

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
