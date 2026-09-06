/** FR-ANLY-04 — labels for demand-tag ownership (Never-Color-Alone). */
export function demandTagOwnershipLabel(isMine: boolean): string {
	return isMine ? 'Your tag' : 'Not on your profile';
}

export type DemandTagRow = {
	tagId: string;
	tag: string;
	demandRank: number;
};

export type DemandTagWithOwnership = DemandTagRow & { isMine: boolean };

/** Intersect platform demand ranks with the viewing provider's offered tags (LLD §8). */
export function highlightOwnServiceTags(
	rows: DemandTagRow[],
	providerTagIds: ReadonlySet<string>
): DemandTagWithOwnership[] {
	return rows.map((row) => ({
		...row,
		isMine: providerTagIds.has(row.tagId)
	}));
}
