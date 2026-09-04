import { describe, expect, it } from 'vitest';
import { rbacFailure } from './authorize';
import { resolveRole } from '../modules/identity-and-access';
import { asId } from '../shared/ids';

describe('RBAC hook mapping', () => {
	it('maps anonymous vs seeker to 401', async () => {
		const decision = await resolveRole({ session: null, routeRequiredRole: 'seeker' });
		expect(rbacFailure(decision)?.status).toBe(401);
	});

	it('maps seeker vs admin to 403', async () => {
		const decision = await resolveRole({
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
		expect(rbacFailure(decision)?.status).toBe(403);
	});

	it('allows anonymous on public routes', async () => {
		const decision = await resolveRole({ session: null, routeRequiredRole: 'anonymous' });
		expect(rbacFailure(decision)).toBeNull();
	});
});
