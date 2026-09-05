import { describe, expect, it } from 'vitest';
import { toPublicProfile } from '../infra/serializers';
import { anonymousAuth, createAuthContext } from '../../../shared/auth-context';
import { asId } from '../../../shared/ids';

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
});
