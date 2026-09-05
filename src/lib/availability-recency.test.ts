import { describe, expect, it } from 'vitest';
import { availabilityPillLabel, formatRecencyPhrase } from './availability-recency';

describe('availability-recency', () => {
	const now = new Date('2026-09-04T20:00:00.000Z');

	it('formats sub-minute recency as just now', () => {
		expect(formatRecencyPhrase('2026-09-04T19:59:30.000Z', now)).toBe('just now');
	});

	it('formats minute-level recency', () => {
		expect(formatRecencyPhrase('2026-09-04T19:48:00.000Z', now)).toBe('12 min ago');
	});

	it('formats hour-level recency', () => {
		expect(formatRecencyPhrase('2026-09-04T18:00:00.000Z', now)).toBe('2 hr ago');
	});

	it('builds the availability pill label with recency phrasing', () => {
		expect(availabilityPillLabel('2026-09-04T19:48:00.000Z', now)).toBe(
			'Available now — updated 12 min ago'
		);
	});

	it('falls back when setAt is missing', () => {
		expect(availabilityPillLabel(null, now)).toBe('Available now');
	});
});
