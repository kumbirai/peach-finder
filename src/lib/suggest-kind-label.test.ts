import { describe, expect, it } from 'vitest';
import { suggestKindLabel } from './suggest-kind-label';

describe('suggestKindLabel', () => {
	it('maps known suggestion kinds to readable labels', () => {
		expect(suggestKindLabel('service')).toBe('Service');
		expect(suggestKindLabel('area')).toBe('Area');
		expect(suggestKindLabel('intent')).toBe('Intent');
		expect(suggestKindLabel('language')).toBe('Language');
	});
});
