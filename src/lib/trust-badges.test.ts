import { describe, expect, it } from 'vitest';
import {
	BADGE_EXPLANATIONS,
	BADGE_LABELS,
	SAFETY_PAGE_PATH,
	isTrustBadgeKind
} from './trust-badges';

describe('trust-badges', () => {
	it('defines exactly the two FRS badge labels', () => {
		expect(Object.keys(BADGE_LABELS).sort()).toEqual(['active-week', 'verified']);
		expect(BADGE_LABELS.verified).toBe('Identity verified');
		expect(BADGE_LABELS['active-week']).toBe('Active this week');
	});

	it('provides a one-line explanation for each trust badge', () => {
		for (const kind of Object.keys(BADGE_LABELS) as Array<keyof typeof BADGE_LABELS>) {
			const explanation = BADGE_EXPLANATIONS[kind];
			expect(explanation.length).toBeGreaterThan(20);
			expect(explanation).toMatch(/does not mean/i);
		}
	});

	it('links badges to the safety information page', () => {
		expect(SAFETY_PAGE_PATH).toBe('/safety');
	});

	it('recognises only the two trust badge kinds', () => {
		expect(isTrustBadgeKind('verified')).toBe(true);
		expect(isTrustBadgeKind('active-week')).toBe(true);
		expect(isTrustBadgeKind('available')).toBe(false);
	});
});
