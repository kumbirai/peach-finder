import { describe, expect, it } from 'vitest';
import { resolveRole } from './index';
import { asId } from '../../shared/ids';

describe('resolveRole', () => {
	it('returns anonymous without a session', async () => {
		const result = await resolveRole({ session: null, routeRequiredRole: 'anonymous' });
		expect(result).toEqual({ role: 'anonymous', forbidden: false, unauthenticated: false });
	});

	it('unauthenticates protected routes without a session', async () => {
		const result = await resolveRole({ session: null, routeRequiredRole: 'seeker' });
		expect(result.unauthenticated).toBe(true);
	});

	it('forbids a seeker on admin routes', async () => {
		const result = await resolveRole({
			session: {
				sessionId: asId<'SessionId'>('01900000-0000-7000-8000-000000000002'),
				userId: asId<'UserId'>('01900000-0000-7000-8000-000000000001'),
				isAdmin: false,
				status: 'active',
				lastSeenAt: new Date(),
				expiresAt: new Date(Date.now() + 1000)
			},
			routeRequiredRole: 'admin'
		});
		expect(result.forbidden).toBe(true);
	});
});
