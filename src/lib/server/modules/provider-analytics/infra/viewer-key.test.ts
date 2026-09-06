import { describe, expect, it } from 'vitest';
import { createAuthContext } from '../../../shared/auth-context';
import { asId } from '../../../shared/ids';
import { deriveViewerKey } from './viewer-key';

describe('deriveViewerKey', () => {
	it('uses session id for authenticated viewers and never returns the raw session id', () => {
		const sessionId = asId<'SessionId'>('01900000-0000-7000-8000-000000000901');
		const auth = createAuthContext({
			userId: asId<'UserId'>('01900000-0000-7000-8000-000000000001'),
			role: 'seeker',
			sessionId,
			ipAddress: '127.0.0.1'
		});
		const occurredAt = new Date('2026-09-06T12:00:00.000Z');
		const key = deriveViewerKey(auth, undefined, occurredAt, 'fallback');
		expect(key).not.toBe(sessionId);
		expect(key).toHaveLength(64);
	});

	it('uses pf_anon for anonymous viewers and never returns the raw cookie', () => {
		const auth = createAuthContext({
			userId: null,
			role: 'anonymous',
			sessionId: null,
			ipAddress: '127.0.0.1'
		});
		const anon = 'abc123anoncookie';
		const key = deriveViewerKey(auth, anon, new Date('2026-09-06T12:00:00.000Z'), 'fallback');
		expect(key).not.toBe(anon);
		expect(key).not.toContain(anon);
	});
});
