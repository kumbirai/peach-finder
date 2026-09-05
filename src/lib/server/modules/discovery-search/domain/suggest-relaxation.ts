import type { StructuredQuery } from './structured-query';

export type RelaxationSuggestion = {
	intentKey: string;
	filterLabel: string;
	actionLabel: string;
};

function intentForKey(sq: StructuredQuery, key: string, fallbackLabel: string): { label: string } {
	const intent = sq.appliedIntents.find((entry) => entry.key === key);
	return { label: intent?.label ?? fallbackLabel };
}

export function suggestRelaxation(sq: StructuredQuery): RelaxationSuggestion | null {
	if (sq.availableNow) {
		const { label } = intentForKey(sq, 'available', 'Available now');
		return {
			intentKey: 'available',
			filterLabel: label,
			actionLabel: `Remove '${label}'`
		};
	}

	if (sq.minRating != null) {
		const { label } = intentForKey(sq, 'rating', `Rating ${sq.minRating}+`);
		return {
			intentKey: 'rating',
			filterLabel: label,
			actionLabel: `Remove '${label}'`
		};
	}

	if (sq.nearMe) {
		const { label } = intentForKey(sq, 'near', 'Near me');
		return {
			intentKey: 'near',
			filterLabel: label,
			actionLabel: 'Widen area'
		};
	}

	if (sq.priceMax != null) {
		const key = `priceMax:${sq.priceMax}`;
		const { label } = intentForKey(sq, key, 'Price limit');
		return {
			intentKey: key,
			filterLabel: label,
			actionLabel: `Remove '${label}'`
		};
	}

	if (sq.priceMin != null) {
		const key = `priceMin:${sq.priceMin}`;
		const { label } = intentForKey(sq, key, 'Minimum price');
		return {
			intentKey: key,
			filterLabel: label,
			actionLabel: `Remove '${label}'`
		};
	}

	if (sq.verified) {
		const { label } = intentForKey(sq, 'verified', 'Verified');
		return {
			intentKey: 'verified',
			filterLabel: label,
			actionLabel: `Remove '${label}'`
		};
	}

	if (sq.languageCodes.length > 0) {
		const code = sq.languageCodes[0]!;
		const key = `lang:${code}`;
		const { label } = intentForKey(sq, key, code);
		return {
			intentKey: key,
			filterLabel: label,
			actionLabel: `Remove '${label}'`
		};
	}

	if (sq.serviceTagIds.length > 0) {
		const id = sq.serviceTagIds[0]!;
		const key = `tag:${id}`;
		const { label } = intentForKey(sq, key, 'Service type');
		return {
			intentKey: key,
			filterLabel: label,
			actionLabel: `Remove '${label}'`
		};
	}

	return null;
}
