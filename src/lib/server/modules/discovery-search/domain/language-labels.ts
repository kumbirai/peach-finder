const LANGUAGE_LABELS: Record<string, string> = {
	en: 'English',
	af: 'Afrikaans',
	zu: 'isiZulu',
	xh: 'isiXhosa',
	st: 'Sesotho'
};

/** Resolve ISO codes to display labels for search cards. */
export function resolveLanguageLabels(codes: string[]): string[] {
	return codes.map((code) => LANGUAGE_LABELS[code] ?? code);
}
