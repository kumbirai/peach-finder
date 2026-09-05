const DEFAULT_MAX_LENGTH = 150;

/** Plain-text intro snippet for search cards and share metadata (FR-SRCH-11). */
export function formatIntroExtract(intro: string, maxLength = DEFAULT_MAX_LENGTH): string {
	const trimmed = intro.trim();
	if (!trimmed) return '';
	if (trimmed.length <= maxLength) return trimmed;

	const slice = trimmed.slice(0, maxLength);
	const lastSpace = slice.lastIndexOf(' ');
	if (lastSpace > maxLength * 0.6) {
		return `${slice.slice(0, lastSpace).trimEnd()}…`;
	}
	return `${slice.trimEnd()}…`;
}
