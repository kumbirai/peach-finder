/** Meaningful hues from DESIGN.md frontmatter. Photography/decoration is out of scope. */
export const DESIGN_COLOR_HEX = {
	peach: '#E8794F',
	peachDeep: '#B34625',
	pine: '#2F5D50',
	pineDeep: '#1E3A32',
	blush: '#F6E4D8',
	cream: '#FBF7F2',
	paper: '#FFFCF9',
	ink: '#2B2622',
	stone: '#6E6459',
	divider: '#C9BDAE',
	peachDeepHover: '#9C3A1D',
	error: '#A5432B'
} as const;

export const INK_RGB = { r: 43, g: 38, b: 34 } as const;
export const TERRACOTTA_RGB = { r: 179, g: 70, b: 37 } as const;

export function parseCssRgb(css: string): { r: number; g: number; b: number } | null {
	const match = css.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
	if (!match) return null;
	return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}

function channelNear(
	actual: { r: number; g: number; b: number },
	expected: { r: number; g: number; b: number },
	tolerance = 8
): boolean {
	return (
		Math.abs(actual.r - expected.r) <= tolerance &&
		Math.abs(actual.g - expected.g) <= tolerance &&
		Math.abs(actual.b - expected.b) <= tolerance
	);
}

export function isAchromaticShadowColor(css: string): boolean {
	const rgb = parseCssRgb(css);
	if (!rgb) return /rgba?\(\s*0\s*,\s*0\s*,\s*0/i.test(css);
	const spread = Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
	return spread <= 6 && rgb.r + rgb.g + rgb.b < 60;
}

export function isWarmOrInkShadow(boxShadow: string): boolean {
	if (!boxShadow || boxShadow === 'none') return false;
	if (isAchromaticShadowColor(boxShadow) && !/43,\s*38,\s*34|179,\s*70,\s*37/.test(boxShadow)) {
		return false;
	}
	const samples = boxShadow.match(/rgba?\([^)]+\)/g) ?? [];
	if (samples.length === 0) return false;
	return samples.every((sample) => {
		const rgb = parseCssRgb(sample);
		if (!rgb) return false;
		return (
			channelNear(rgb, INK_RGB) ||
			channelNear(rgb, TERRACOTTA_RGB) ||
			channelNear(rgb, { r: 156, g: 58, b: 29 })
		);
	});
}

export function isTerracottaFocusColor(css: string): boolean {
	const rgb = parseCssRgb(css);
	if (!rgb) return /179,\s*70,\s*37|#b34625/i.test(css);
	return channelNear(rgb, TERRACOTTA_RGB, 12);
}
