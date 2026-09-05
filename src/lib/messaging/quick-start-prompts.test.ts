import { describe, expect, it } from 'vitest';
import { SEEKER_QUICK_START_PROMPTS, insertQuickStartText } from './quick-start-prompts';

describe('quick-start-prompts', () => {
	it('TC-MSG-03a: exposes plain-text availability prompts for seekers', () => {
		expect(SEEKER_QUICK_START_PROMPTS.length).toBeGreaterThanOrEqual(2);
		for (const prompt of SEEKER_QUICK_START_PROMPTS) {
			expect(prompt.label.length).toBeGreaterThan(0);
			expect(prompt.text.length).toBeGreaterThan(0);
			expect(prompt.text).not.toMatch(/^\{/);
		}
	});

	it('insertQuickStartText fills an empty composer', () => {
		expect(insertQuickStartText('', 'Are you available today?')).toBe('Are you available today?');
		expect(insertQuickStartText('   ', 'Are you free this afternoon?')).toBe(
			'Are you free this afternoon?'
		);
	});

	it('insertQuickStartText appends to an existing draft', () => {
		expect(insertQuickStartText('Hi', 'Are you available today?')).toBe(
			'Hi Are you available today?'
		);
	});
});
