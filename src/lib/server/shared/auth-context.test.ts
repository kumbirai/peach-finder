import { describe, expect, it } from 'vitest';
import { AuthorizationBug, createAuthContext, roleSatisfies } from './auth-context';
import { asId } from './ids';

describe('AuthContext', () => {
	it('throws AuthorizationBug when requireRole is unmet', () => {
		const ctx = createAuthContext({
			userId: asId<'UserId'>('01900000-0000-7000-8000-000000000001'),
			role: 'seeker',
			sessionId: asId<'SessionId'>('01900000-0000-7000-8000-000000000002'),
			ipAddress: '127.0.0.1'
		});
		expect(() => ctx.requireRole('admin')).toThrow(AuthorizationBug);
	});

	it('throws AuthorizationBug when ownership mismatches', () => {
		const ctx = createAuthContext({
			userId: asId<'UserId'>('01900000-0000-7000-8000-000000000001'),
			role: 'seeker',
			sessionId: asId<'SessionId'>('01900000-0000-7000-8000-000000000002'),
			ipAddress: '127.0.0.1'
		});
		expect(() =>
			ctx.requireOwnership(asId<'UserId'>('01900000-0000-7000-8000-000000000099'))
		).toThrow(AuthorizationBug);
	});

	it('treats anonymous as the public floor', () => {
		expect(roleSatisfies('seeker', 'anonymous')).toBe(true);
		expect(roleSatisfies('anonymous', 'seeker')).toBe(false);
	});
});
