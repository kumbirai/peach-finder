import type { LexiconEntryType } from './maps-to';
import { emptyStructuredQuery, type AppliedIntent, type StructuredQuery } from './structured-query';

export type LexiconEntry = {
	term: string;
	entryType: LexiconEntryType;
	mapsTo: unknown;
};

export type ManualFilters = {
	availableNow?: boolean;
	verified?: boolean;
	languageCodes?: string[];
	serviceTagIds?: string[];
	minRating?: number;
	priceMin?: number;
	priceMax?: number;
	nearMe?: boolean;
};

export type ParseConfig = {
	highlyRatedMinAverage: number;
	highlyRatedMinReviews: number;
};

const DEFAULT_PARSE_CONFIG: ParseConfig = {
	highlyRatedMinAverage: 4.5,
	highlyRatedMinReviews: 3
};

const STOPWORDS = new Set(['who', 'the', 'a', 'an', 'and', 'or', 'with', 'for', 'in', 'on', 'at']);
const VERTICAL_NOISE = new Set(['massage', 'therapist', 'therapy']);

function normalize(raw: string): string[] {
	return raw
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, ' ')
		.split(/\s+/)
		.filter(Boolean);
}

function findLongestMatch(
	tokens: string[],
	index: number,
	lexicon: LexiconEntry[]
): LexiconEntry | null {
	for (let len = Math.min(4, tokens.length - index); len >= 1; len--) {
		const phrase = tokens.slice(index, index + len).join(' ');
		const hit = lexicon.find((e) => e.term.toLowerCase() === phrase);
		if (hit) return hit;
	}
	return null;
}

function applyMapsTo(sq: StructuredQuery, entry: LexiconEntry, config: ParseConfig): void {
	const maps = entry.mapsTo as Record<string, unknown>;
	switch (entry.entryType) {
		case 'service_term':
			if (typeof maps.serviceTagId === 'string') {
				sq.serviceTagIds.push(maps.serviceTagId);
				sq.appliedIntents.push({
					key: `tag:${maps.serviceTagId}`,
					label: entry.term,
					source: 'query'
				});
			}
			break;
		case 'language':
			if (typeof maps.language === 'string') {
				sq.languageCodes.push(maps.language);
				sq.appliedIntents.push({
					key: `lang:${maps.language}`,
					label: entry.term,
					source: 'query'
				});
			}
			break;
		case 'intent_availability':
			sq.availableNow = true;
			sq.appliedIntents.push({ key: 'available', label: 'Available now', source: 'query' });
			break;
		case 'intent_rating': {
			const value = typeof maps.value === 'number' ? maps.value : config.highlyRatedMinAverage;
			const minCount =
				typeof maps.minCount === 'number' ? maps.minCount : config.highlyRatedMinReviews;
			sq.minRating = value;
			sq.minRatingCount = minCount;
			sq.appliedIntents.push({
				key: 'rating',
				label: `Highly rated (${value}+)`,
				source: 'query'
			});
			break;
		}
		case 'intent_verification':
			sq.verified = true;
			sq.appliedIntents.push({ key: 'verified', label: 'Verified', source: 'query' });
			break;
		case 'intent_proximity':
			sq.nearMe = true;
			sq.appliedIntents.push({ key: 'near', label: 'Near me', source: 'query' });
			break;
		default:
			break;
	}
}

export function parseQuery(
	rawQuery: string,
	lexicon: LexiconEntry[],
	manual: ManualFilters,
	config: ParseConfig = DEFAULT_PARSE_CONFIG
): StructuredQuery {
	const sq = emptyStructuredQuery();
	const tokens = normalize(rawQuery);
	const leftovers: string[] = [];
	let i = 0;
	while (i < tokens.length) {
		if (STOPWORDS.has(tokens[i]!) || VERTICAL_NOISE.has(tokens[i]!)) {
			i++;
			continue;
		}
		const match = findLongestMatch(tokens, i, lexicon);
		if (match) {
			applyMapsTo(sq, match, config);
			const phraseLen = match.term.split(/\s+/).length;
			i += phraseLen;
			continue;
		}
		leftovers.push(tokens[i]!);
		i++;
	}
	sq.freeText = leftovers.join(' ');

	if (manual.availableNow) {
		sq.availableNow = true;
		sq.appliedIntents.push({ key: 'available', label: 'Available now', source: 'manual' });
	}
	if (manual.verified) {
		sq.verified = true;
		sq.appliedIntents.push({ key: 'verified', label: 'Verified', source: 'manual' });
	}
	if (manual.languageCodes?.length) {
		for (const code of manual.languageCodes) {
			if (!sq.languageCodes.includes(code)) {
				sq.languageCodes.push(code);
				const label =
					lexicon.find(
						(entry) =>
							entry.entryType === 'language' &&
							(entry.mapsTo as { language?: string }).language === code
					)?.term ?? code;
				sq.appliedIntents.push({
					key: `lang:${code}`,
					label: label.charAt(0).toUpperCase() + label.slice(1),
					source: 'manual'
				});
			}
		}
	}
	if (manual.serviceTagIds?.length) {
		for (const id of manual.serviceTagIds) {
			if (!sq.serviceTagIds.includes(id)) {
				sq.serviceTagIds.push(id);
				const label =
					lexicon.find(
						(entry) =>
							entry.entryType === 'service_term' &&
							(entry.mapsTo as { serviceTagId?: string }).serviceTagId === id
					)?.term ?? 'Service';
				sq.appliedIntents.push({
					key: `tag:${id}`,
					label: label.charAt(0).toUpperCase() + label.slice(1),
					source: 'manual'
				});
			}
		}
	}
	if (manual.minRating != null) {
		sq.minRating = Math.max(sq.minRating ?? 0, manual.minRating);
		const hasQueryRatingIntent = sq.appliedIntents.some(
			(intent) => intent.key === 'rating' && intent.source === 'query'
		);
		// Manual-only rating: require ≥1 review so zero-review providers stay "New" (FR-REV-05).
		// Query-derived "highly rated" keeps its lexicon min review count (default 3).
		sq.minRatingCount = hasQueryRatingIntent ? Math.max(sq.minRatingCount, 1) : 1;
		if (!sq.appliedIntents.some((intent) => intent.key === 'rating')) {
			sq.appliedIntents.push({
				key: 'rating',
				label: `Rating ${manual.minRating}+`,
				source: 'manual'
			});
		}
	}
	if (manual.priceMin != null) {
		sq.priceMin = manual.priceMin;
		sq.appliedIntents.push({
			key: `priceMin:${manual.priceMin}`,
			label: `From R${Math.round(manual.priceMin / 100)}`,
			source: 'manual'
		});
	}
	if (manual.priceMax != null) {
		sq.priceMax = manual.priceMax;
		sq.appliedIntents.push({
			key: `priceMax:${manual.priceMax}`,
			label: `Under R${Math.round(manual.priceMax / 100)}`,
			source: 'manual'
		});
	}
	if (manual.nearMe) {
		sq.nearMe = true;
		if (!sq.appliedIntents.some((intent) => intent.key === 'near')) {
			sq.appliedIntents.push({ key: 'near', label: 'Near me', source: 'manual' });
		}
	}

	return sq;
}

export function dedupeIntents(intents: AppliedIntent[]): AppliedIntent[] {
	const seen = new Set<string>();
	return intents.filter((intent) => {
		if (seen.has(intent.key)) return false;
		seen.add(intent.key);
		return true;
	});
}
