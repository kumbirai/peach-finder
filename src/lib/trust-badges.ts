export const SAFETY_PAGE_PATH = '/safety';

export type TrustBadgeKind = 'verified' | 'active-week';

export const BADGE_LABELS: Record<TrustBadgeKind, string> = {
	verified: 'Identity verified',
	'active-week': 'Active this week'
};

/** One-line plain-language copy shown on badge tap/hover (FR-TRUST-09). */
export const BADGE_EXPLANATIONS: Record<TrustBadgeKind, string> = {
	verified:
		'A Peach Finder admin checked this provider’s ID — it does not mean they are licensed or background-checked.',
	'active-week':
		'This provider was active on Peach Finder in the last 7 days — it does not mean they are available right now.'
};

export function isTrustBadgeKind(kind: string): kind is TrustBadgeKind {
	return kind === 'verified' || kind === 'active-week';
}
