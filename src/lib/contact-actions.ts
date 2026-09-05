/** Call link for profile contact bar — omitted when phone is not in the served profile DTO. */
export function resolveCallHref(
	phone: string | undefined | null,
	previewMode = false
): string | undefined {
	if (!phone) return undefined;
	return previewMode ? '#' : `tel:${phone}`;
}

/** First token of display name for personalised CTA copy (prototype: "Message Amara"). */
export function messageButtonLabel(displayName: string): string {
	const first = displayName.trim().split(/\s+/)[0];
	return first ? `Message ${first}` : 'Message';
}

/** Append session draft for US-ACC-02 continuity (mirrored in static/message-draft-nav.js). */
export function appendMessageDraftToUrl(href: string, draft: string): string {
	const url = new URL(href);
	url.searchParams.set('draft', draft);
	return url.href;
}
