import { describe, expect, it } from 'vitest';
import { anonymousAuth } from '../../../shared/auth-context';
import { toSearchCard, toSuggestions } from './serializers';

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
				providerProfileId: 'profile-1',
				displayName: 'Lerato K.',
				photoPrimaryUrl: null,
				availabilityState: 'available',
				availabilitySetAt: new Date('2026-09-04T19:15:00Z'),
				ratingAverage: null,
				ratingCount: 0,
				badgeIdentityVerified: false,
				badgeActiveThisWeek: true,
				isFeatured: false,
				priceMinCents: 65_000,
				areaName: 'Johannesburg',
				distanceKm: null
			},
			anonymousAuth('127.0.0.1')
		);
		expect(card.rating).toEqual({ state: 'new' });
	});

	it('TC-DISC-06c: featured providers serialize isFeatured for always-visible labelling', () => {
		const card = toSearchCard(
			{
				providerProfileId: 'profile-1',
				displayName: 'Amara T.',
				photoPrimaryUrl: null,
				availabilityState: 'available',
				availabilitySetAt: new Date('2026-09-04T18:00:00Z'),
				ratingAverage: '4.9',
				ratingCount: 128,
				badgeIdentityVerified: true,
				badgeActiveThisWeek: true,
				isFeatured: true,
				priceMinCents: 65_000,
				areaName: 'Rosebank',
				distanceKm: null
			},
			anonymousAuth('127.0.0.1')
		);
		expect(card.isFeatured).toBe(true);
	});

	it('TC-DISC-05: includes distance to provider area when coords are present', () => {
		const card = toSearchCard(
			{
				providerProfileId: 'profile-1',
				displayName: 'Amara T.',
				photoPrimaryUrl: null,
				availabilityState: 'available',
				availabilitySetAt: new Date('2026-09-04T18:00:00Z'),
				ratingAverage: '4.9',
				ratingCount: 128,
				badgeIdentityVerified: true,
				badgeActiveThisWeek: true,
				isFeatured: true,
				priceMinCents: 35_000,
				areaName: 'Rosebank',
				distanceKm: 2.1
			},
			anonymousAuth('127.0.0.1')
		);
		expect(card.distanceKm).toBe(2.1);
		expect(card.areaName).toBe('Rosebank');
	});
});
