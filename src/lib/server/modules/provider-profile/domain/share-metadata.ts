const DEFAULT_MAX_LENGTH = 150;

export type ShareMetadata = {
	title: string;
	description: string;
	image: string | null;
};

/** Plain-text intro snippet for Open Graph description (FR-PROF-11). */
function formatIntroExtract(intro: string, maxLength = DEFAULT_MAX_LENGTH): string {
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

export function buildShareMetadata(
	displayName: string,
	intro: string,
	primaryPhotoUrl: string | null | undefined,
	origin: string
): ShareMetadata {
	return {
		title: displayName,
		description: formatIntroExtract(intro),
		image: primaryPhotoUrl ? new URL(primaryPhotoUrl, origin).href : null
	};
}
