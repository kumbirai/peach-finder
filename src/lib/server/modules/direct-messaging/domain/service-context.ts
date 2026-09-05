/** Editable first-contact prefill when a thread starts from a specific service (FR-MSG-04). */
export function formatServiceContextDraft(serviceName: string): string {
	const trimmed = serviceName.trim();
	if (!trimmed) return '';
	return `Re: ${trimmed}`;
}

/** Resolve composer draft: pending held message, then sign-up draft / service context for new threads only. */
export function resolveComposerDraft(input: {
	draftParam: string | null;
	serviceContextParam: string | null;
	pendingBody: string | null;
	hasExistingThread: boolean;
}): string {
	if (input.pendingBody) return input.pendingBody;
	if (input.hasExistingThread) return '';
	if (input.draftParam) return input.draftParam;
	if (input.serviceContextParam) {
		return formatServiceContextDraft(input.serviceContextParam);
	}
	return '';
}
