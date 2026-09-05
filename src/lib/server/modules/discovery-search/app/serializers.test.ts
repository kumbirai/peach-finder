import { describe, expect, it } from 'vitest';
import { anonymousAuth, createAuthContext } from '../../../shared/auth-context';
import { asId } from '../../../shared/ids';
import { toSearchCard, toSuggestions } from './serializers';

const baseRow = {
	providerProfileId: '01900000-0000-7000-8000-000000000101',
	displayName: 'Amara T.',
	photoPrimaryUrl: '/placeholder-photo.svg',
	introExtract: 'Deep tissue specialist helping you unwind after long work weeks.',
	availabilityState: 'available',
	availabilitySetAt: new Date('2026-09-04T18:00:00Z'),
	ratingAverage: '4.9',
	ratingCount: 128,
	badgeIdentityVerified: true,
	badgeActiveThisWeek: true,
	isFeatured: true,
	priceMinCents: 65_000,
	areaName: 'Rosebank',
	distanceKm: 2.1,
	languageCodes: ['en', 'zu']
};

describe('toSuggestions', () => {
	it('returns term and kind only with no provider-name fields', () => {
		const rows = [
			{ term: 'deep tissue', kind: 'service' },
			{ term: 'rosebank', kind: 'area' }
		];
		const suggestions = toSuggestions(rows);
		expect(suggestions).toEqual([
			{ term: 'deep tissue', kind: 'service' },
			{ term: 'rosebank', kind: 'area' }
		]);
		for (const item of suggestions) {
			expect(Object.keys(item).sort()).toEqual(['kind', 'term']);
		}
	});
});

describe('toSearchCard', () => {
	it('TC-DISC-04c: zero-review providers serialize as New, never a zero score', () => {
		const card = toSearchCard(
			{
				...baseRow,
				ratingAverage: null,
				ratingCount: 0,
				isFeatured: false,
				distanceKm: null
			},
			anonymousAuth('127.0.0.1')
		);
		expect(card.rating).toEqual({ state: 'new' });
	});

	it('TC-DISC-06c: featured providers serialize isFeatured for always-visible labelling', () => {
		const card = toSearchCard(baseRow, anonymousAuth('127.0.0.1'));
		expect(card.isFeatured).toBe(true);
	});

	it('TC-DISC-05: includes distance to provider area when coords are present', () => {
		const card = toSearchCard({ ...baseRow, priceMinCents: 35_000 }, anonymousAuth('127.0.0.1'));
		expect(card.distanceKm).toBe(2.1);
		expect(card.areaName).toBe('Rosebank');
	});

	it('TC-DISC-08a: includes intro extract, languages, and gated message action', () => {
		const card = toSearchCard(baseRow, anonymousAuth('127.0.0.1'));
		expect(card.introExtract).toContain('Deep tissue specialist');
		expect(card.languages).toEqual(['English', 'isiZulu']);
		expect(card.messageHref).toContain('/sign-in?');
		expect(card.messageHref).toContain('action=message');
	});

	it('TC-DISC-08a: signed-in seekers get a direct compose link', () => {
		const card = toSearchCard(
			baseRow,
			createAuthContext({
				userId: asId<'UserId'>('01900000-0000-7000-8000-000000000099'),
				role: 'seeker',
				sessionId: null,
				ipAddress: '127.0.0.1'
			})
		);
		expect(card.messageHref).toBe('/messages/compose/01900000-0000-7000-8000-000000000101');
	});
});
