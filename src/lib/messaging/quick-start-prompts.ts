export type QuickStartPrompt = {
	label: string;
	text: string;
};

/** Seeker composer quick-start prompts — plain text only (FR-MSG-03/04). */
export const SEEKER_QUICK_START_PROMPTS: readonly QuickStartPrompt[] = [
	{ label: 'Are you available today?', text: 'Are you available today?' },
	{ label: 'Rate for 60 min?', text: "What's your rate for a 60 minute session?" },
	{ label: 'Are you free this afternoon?', text: 'Are you free this afternoon?' }
] as const;

/** Insert prompt text into the composer; existing draft is preserved with a space separator. */
export function insertQuickStartText(current: string, promptText: string): string {
	const trimmed = current.trim();
	if (!trimmed) return promptText;
	return `${trimmed} ${promptText}`;
}
