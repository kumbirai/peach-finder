import { describe, expect, it } from 'vitest';
import { auditActionForModeration, MODERATION_ACTION_KINDS } from './moderation-actions';

describe('moderation action domain', () => {
	it('lists every FR-ADM-05 action kind', () => {
		expect(MODERATION_ACTION_KINDS).toEqual([
			'remove_photo',
			'remove_review',
			'unpublish',
			'suspend',
			'reinstate',
			'revoke_badge'
		]);
	});

	it('maps revoke badge to identity.revoke audit action', () => {
		expect(auditActionForModeration('revoke_badge')).toBe('identity.revoke');
		expect(auditActionForModeration('suspend')).toBe('moderation.suspend');
	});
});
