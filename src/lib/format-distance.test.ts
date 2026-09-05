import { describe, expect, it } from 'vitest';
import { formatDistanceKm } from './format-distance';

describe('formatDistanceKm', () => {
	it('formats sub-kilometre distances in metres', () => {
		expect(formatDistanceKm(0.8)).toBe('800 m');
	});

	it('formats kilometres with one decimal under 10 km', () => {
		expect(formatDistanceKm(2.1)).toBe('2.1 km');
	});

	it('rounds longer distances', () => {
		expect(formatDistanceKm(12.4)).toBe('12 km');
	});
});
