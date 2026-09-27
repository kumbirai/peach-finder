import { describe, expect, it } from 'vitest';
import { initialComposeDraft } from './compose-draft';

describe('initialComposeDraft', () => {
	it('prefers the query draft when present', () => {
		expect(initialComposeDraft('from url', 'from storage')).toBe('from url');
	});

	it('restores session storage when the query draft is empty', () => {
		expect(initialComposeDraft('', 'Hi, are you available this afternoon?')).toBe(
			'Hi, are you available this afternoon?'
		);
	});

	it('returns empty when neither source has text', () => {
		expect(initialComposeDraft('   ', null)).toBe('');
	});
});
