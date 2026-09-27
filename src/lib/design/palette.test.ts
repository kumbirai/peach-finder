import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	DESIGN_COLOR_HEX,
	isAchromaticShadowColor,
	isTerracottaFocusColor,
	isWarmOrInkShadow
} from './palette';

describe('DESIGN.md palette', () => {
	it('matches the documented token hex values', () => {
		const design = readFileSync(join(process.cwd(), 'DESIGN.md'), 'utf8');
		expect(design).toContain(`peach: "${DESIGN_COLOR_HEX.peach}"`);
		expect(design).toContain(`peach-deep: "${DESIGN_COLOR_HEX.peachDeep}"`);
		expect(design).toContain(`ink: "${DESIGN_COLOR_HEX.ink}"`);
		expect(design).toContain(`cream: "${DESIGN_COLOR_HEX.cream}"`);
	});

	it('accepts ink and terracotta shadows and rejects gray/black', () => {
		expect(isWarmOrInkShadow('0 1px 2px rgba(43, 38, 34, 0.06)')).toBe(true);
		expect(isWarmOrInkShadow('0 12px 24px rgba(179, 70, 37, 0.14)')).toBe(true);
		expect(isWarmOrInkShadow('0 8px 16px rgba(0, 0, 0, 0.2)')).toBe(false);
		expect(isAchromaticShadowColor('rgba(0, 0, 0, 0.2)')).toBe(true);
		expect(isTerracottaFocusColor('rgb(179, 70, 37)')).toBe(true);
	});
});
