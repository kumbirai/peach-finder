import { describe, expect, it } from 'vitest';
import { anonymousAuth, createAuthContext } from '../../../shared/auth-context';
import { asId } from '../../../shared/ids';
import { resolveProfileActionHrefs } from './profile-action-hrefs';

const PROFILE_ID = '01900000-0000-7000-8000-000000000101';
const PROFILE_PATH = `/provider/${PROFILE_ID}`;

describe('resolveProfileActionHrefs', () => {
	it('routes anonymous viewers through sign-in for gated actions', () => {
		const hrefs = resolveProfileActionHrefs(PROFILE_ID, PROFILE_PATH, anonymousAuth('127.0.0.1'));
		expect(hrefs.message).toContain('/sign-in?');
		expect(hrefs.message).toContain('action=message');
		expect(hrefs.review).toContain('action=review');
		expect(hrefs.report).toContain('action=report');
		expect(hrefs.report).toContain(`providerProfileId=${PROFILE_ID}`);
	});

	it('routes signed-in seekers directly to compose for message', () => {
		const hrefs = resolveProfileActionHrefs(
			PROFILE_ID,
			PROFILE_PATH,
			createAuthContext({
				userId: asId<'UserId'>('01900000-0000-7000-8000-000000000201'),
				role: 'seeker',
				sessionId: asId<'SessionId'>('01900000-0000-7000-8000-000000000301'),
				ipAddress: '127.0.0.1'
			})
		);
		expect(hrefs.message).toBe(`/messages/compose/${PROFILE_ID}`);
		expect(hrefs.review).toBe(`/provider/${PROFILE_ID}/review`);
		expect(hrefs.report).toBe(`/provider/${PROFILE_ID}/report`);
	});
});
