import { describe, expect, it } from 'vitest';
import { matchesGlob } from './seed.config';

describe('SEED_ONLY glob', () => {
	it('matches persona keys with * and exact names', () => {
		expect(matchesGlob('ui-provider-available', 'ui-provider-available')).toBe(true);
		expect(matchesGlob('ui-provider-available', 'ui-provider-*')).toBe(true);
		expect(matchesGlob('ui-seeker', 'ui-provider*')).toBe(false);
	});
});
