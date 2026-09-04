import type { ValidationIssue } from '../../../shared/result';

export type ServiceInput = {
	name: string;
	description?: string;
	durationMinutes: number;
	priceCents: number;
};

export function validateServiceInput(input: ServiceInput): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	const name = input.name.trim();
	if (!name) {
		issues.push({ path: 'name', message: 'Enter a service name.' });
	} else if (name.length > 120) {
		issues.push({ path: 'name', message: 'Service name is too long.' });
	}
	if (input.description && input.description.length > 1000) {
		issues.push({ path: 'description', message: 'Description is too long.' });
	}
	if (
		!Number.isInteger(input.durationMinutes) ||
		input.durationMinutes < 1 ||
		input.durationMinutes > 600
	) {
		issues.push({
			path: 'durationMinutes',
			message: 'Duration must be between 1 and 600 minutes.'
		});
	}
	if (!Number.isInteger(input.priceCents) || input.priceCents < 0) {
		issues.push({ path: 'priceCents', message: 'Enter a valid price.' });
	}
	return issues;
}
