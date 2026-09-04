import { describe, expect, it } from 'vitest';
import { assertCanSelfDelete, IllegalAccountTransitionError } from './account-status';

describe('assertCanSelfDelete', () => {
	it('allows active and suspended accounts', () => {
		expect(() => assertCanSelfDelete('active')).not.toThrow();
		expect(() => assertCanSelfDelete('suspended')).not.toThrow();
	});

	it('rejects deleted accounts', () => {
		expect(() => assertCanSelfDelete('deleted')).toThrow(IllegalAccountTransitionError);
	});
});
