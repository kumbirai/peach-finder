import { describe, expect, it } from 'vitest';
import { buildPostAuthRedirect } from './post-auth-redirect';

describe('buildPostAuthRedirect', () => {
	it('routes message action to compose page', () => {
		expect(
			buildPostAuthRedirect({
				returnTo: '/provider/abc',
				action: 'message',
				providerProfileId: '01900000-0000-7000-8000-000000000101'
			})
		).toBe('/messages/compose/01900000-0000-7000-8000-000000000101');
	});

	it('preserves message draft on compose redirect', () => {
		expect(
			buildPostAuthRedirect({
				returnTo: '/provider/abc',
				action: 'message',
				providerProfileId: '01900000-0000-7000-8000-000000000101',
				messageDraft: 'Hello there'
			})
		).toBe('/messages/compose/01900000-0000-7000-8000-000000000101?draft=Hello%20there');
	});

	it('routes report action to the profile report page', () => {
		expect(
			buildPostAuthRedirect({
				returnTo: '/provider/abc',
				action: 'report',
				providerProfileId: '01900000-0000-7000-8000-000000000101'
			})
		).toBe('/provider/01900000-0000-7000-8000-000000000101/report');
	});

	it('routes review action to the profile review page', () => {
		expect(
			buildPostAuthRedirect({
				returnTo: '/provider/abc',
				action: 'review',
				providerProfileId: '01900000-0000-7000-8000-000000000101'
			})
		).toBe('/provider/01900000-0000-7000-8000-000000000101/review');
	});

	it('falls back to returnTo when action has no dedicated route', () => {
		expect(
			buildPostAuthRedirect({
				returnTo: '/profile',
				action: 'block',
				providerProfileId: 'abc'
			})
		).toBe('/profile');
	});
});
