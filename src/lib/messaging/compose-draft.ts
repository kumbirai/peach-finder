export function initialComposeDraft(queryDraft: string, storedDraft: string | null): string {
	const fromQuery = queryDraft.trim();
	if (fromQuery) return queryDraft;
	return storedDraft?.trim() ? storedDraft : '';
}
