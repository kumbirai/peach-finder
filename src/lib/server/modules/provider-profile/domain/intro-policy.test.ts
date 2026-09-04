import { describe, expect, it } from 'vitest';
import { INTRO_MAX_LENGTH, validateIntro } from './intro-policy';

describe('validateIntro', () => {
	it('rejects empty intro', () => {
		expect(validateIntro('   ')).toHaveLength(1);
	});

	it('accepts trimmed intro within cap', () => {
		expect(validateIntro('  Hello world  ')).toEqual([]);
	});

	it('rejects intro over the cap', () => {
		const long = 'a'.repeat(INTRO_MAX_LENGTH + 1);
		expect(validateIntro(long)).toHaveLength(1);
	});
});
