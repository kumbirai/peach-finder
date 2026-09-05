import { describe, expect, it } from 'vitest';
import { toPublicProfile } from '../infra/serializers';
import { anonymousAuth, createAuthContext } from '../../../shared/auth-context';
import { asId } from '../../../shared/ids';
import {
	isCoarsePresenceBucket,
	isCoarseResponseTimeBucket
} from '../../direct-messaging/domain/presence-contract';

const baseView = {
	id: asId<'ProviderProfileId'>('01900000-0000-7000-8000-000000000101'),
	ownerId: '01900000-0000-7000-8000-000000000001',
	intro: 'Relaxing massage',
	phoneVisible: false,
	publishState: 'published',
	displayName: 'Amara T.',
	areaName: 'Rosebank',
	areaSlug: 'rosebank',
	services: [],
	tags: [],
	languages: [],
	photos: [],
	badges: { identityVerified: true, activeThisWeek: false },
	ratingAverage: null,
	ratingCount: 0,
	responseTime: null,
	onlineStatus: null,
	availabilityState: 'available',
	availabilitySetAt: null,
	phone: '+27821234001',
	reviews: []
};

describe('toPublicProfile', () => {
	it('omits phone for anonymous viewers when phone_visible is off', () => {
		const dto = toPublicProfile(baseView, anonymousAuth('127.0.0.1'));
		expect(dto.phone).toBeUndefined();
		expect('phone' in dto).toBe(false);
		expect(JSON.stringify(dto)).not.toContain('"phone"');
		expect(JSON.stringify(dto)).not.toContain('+27821234001');
	});

	it('includes phone for signed-in seekers when phone_visible is off', () => {
		const seeker = createAuthContext({
			userId: asId<'UserId'>('01900000-0000-7000-8000-000000000099'),
			role: 'seeker',
			sessionId: asId<'SessionId'>('01900000-0000-7000-8000-000000000701'),
			ipAddress: '127.0.0.1'
		});
		const dto = toPublicProfile(baseView, seeker);
		expect(dto.phone).toBe('+27821234001');
	});

	it('includes phone for anonymous viewers when phone_visible is on', () => {
		const dto = toPublicProfile({ ...baseView, phoneVisible: true }, anonymousAuth('127.0.0.1'));
		expect(dto.phone).toBe('+27821234001');
	});

	it('TC-PRIV-02a: exposes area only and never a street address field', () => {
		const dto = toPublicProfile(baseView, anonymousAuth('127.0.0.1'));
		expect(dto.area).toEqual({ name: 'Rosebank', slug: 'rosebank' });
		expect('address' in dto).toBe(false);
		expect('street' in dto).toBe(false);
		expect('streetAddress' in dto).toBe(false);
		expect(JSON.stringify(dto)).not.toMatch(/"address"/);
	});

	it('TC-VIEW-02a: serializes coarse presence buckets only', () => {
		for (const onlineStatus of ['online', 'today', 'this_week', 'a_while_ago'] as const) {
			const dto = toPublicProfile({ ...baseView, onlineStatus }, anonymousAuth('127.0.0.1'));
			expect(isCoarsePresenceBucket(dto.onlineStatus)).toBe(true);
			expect(JSON.stringify(dto)).not.toMatch(/lastSeen|last_seen|lastActive|last_active/);
		}
	});

	it('TC-VIEW-02b: omits fabricated response-time claims when data is absent', () => {
		const dto = toPublicProfile({ ...baseView, responseTime: null }, anonymousAuth('127.0.0.1'));
		expect(dto.responseTime).toBeNull();
		expect(isCoarseResponseTimeBucket(dto.responseTime)).toBe(false);

		const withClaim = toPublicProfile(
			{ ...baseView, responseTime: 'within_30_min' },
			anonymousAuth('127.0.0.1')
		);
		expect(isCoarseResponseTimeBucket(withClaim.responseTime)).toBe(true);
	});
});
