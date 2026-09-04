import type { ValidationIssue } from '../../../shared/result';

export const INTRO_MAX_LENGTH = 600;

export function validateIntro(raw: string): ValidationIssue[] {
	const trimmed = raw.trim();
	const issues: ValidationIssue[] = [];
	if (!trimmed) {
		issues.push({ path: 'intro', message: 'Write a short introduction.' });
	} else if (trimmed.length > INTRO_MAX_LENGTH) {
		issues.push({
			path: 'intro',
			message: `Keep your introduction to ${INTRO_MAX_LENGTH} characters or fewer.`
		});
	}
	return issues;
}
