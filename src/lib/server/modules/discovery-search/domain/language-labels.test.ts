import { describe, expect, it } from 'vitest';
import { resolveLanguageLabels } from './language-labels';

describe('resolveLanguageLabels', () => {
	it('maps seeded language codes to display labels', () => {
		expect(resolveLanguageLabels(['en', 'zu'])).toEqual(['English', 'isiZulu']);
	});

	it('falls back to the code for unknown languages', () => {
		expect(resolveLanguageLabels(['xx'])).toEqual(['xx']);
	});
});
