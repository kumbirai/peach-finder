import { describe, expect, it } from 'vitest';
import { parseQuery } from './parse-query';

const lexicon = [
	{ term: 'zulu', entryType: 'language' as const, mapsTo: { language: 'zu' } },
	{
		term: 'available now',
		entryType: 'intent_availability' as const,
		mapsTo: { filter: 'available_now' }
	},
	{ term: 'verified', entryType: 'intent_verification' as const, mapsTo: { filter: 'verified' } }
];

describe('parseQuery', () => {
	it('parses language and availability intents from free text', () => {
		const sq = parseQuery('massage therapist who speaks zulu available now', lexicon, {});
		expect(sq.languageCodes).toContain('zu');
		expect(sq.availableNow).toBe(true);
		expect(sq.freeText).toContain('massage');
	});

	it('merges manual filters', () => {
		const sq = parseQuery('', lexicon, { verified: true });
		expect(sq.verified).toBe(true);
	});
});
