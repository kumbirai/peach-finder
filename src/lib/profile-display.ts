export type PresenceBucket = 'online' | 'today' | 'this_week' | 'a_while_ago';
export type ResponseTimeBucket = 'within_30_min' | 'within_a_few_hours' | 'within_a_day';

export function formatRatingLabel(
	rating: { average: number; count: number } | { state: 'new' }
): string {
	if ('state' in rating) return 'New';
	return `${rating.average.toFixed(1)} (${rating.count} reviews)`;
}

export function formatOnlineStatus(status: PresenceBucket | string | null): string | null {
	if (!status) return null;
	switch (status) {
		case 'online':
			return 'Online now';
		case 'today':
			return 'Active today';
		case 'this_week':
			return 'Active this week';
		case 'a_while_ago':
			return 'Active a while ago';
		default:
			return null;
	}
}

export function formatResponseTime(bucket: ResponseTimeBucket | string | null): string | null {
	if (!bucket) return null;
	switch (bucket) {
		case 'within_30_min':
			return 'Usually responds within 30 minutes';
		case 'within_a_few_hours':
			return 'Usually responds within a few hours';
		case 'within_a_day':
			return 'Usually responds within a day';
		default:
			return null;
	}
}

export function formatReviewDate(iso: string): string {
	const date = new Date(iso);
	return date.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
}

export function reviewerInitialName(fullName: string): string {
	const parts = fullName.trim().split(/\s+/);
	if (parts.length === 0) return 'Anonymous';
	const first = parts[0] ?? 'Anonymous';
	const lastInitial = parts.length > 1 ? `${parts[parts.length - 1]![0]}.` : '';
	return lastInitial ? `${first} ${lastInitial}` : first;
}
