import type { MissingField } from './publish-readiness';

export const MISSING_FIELD_LABELS: Record<MissingField, string> = {
	photo: 'at least one photo',
	intro: 'introduction',
	priced_service: 'at least one priced service',
	language: 'at least one language',
	area: 'general area'
};

export function formatMissingFields(missing: MissingField[]): string {
	return missing.map((field) => MISSING_FIELD_LABELS[field]).join(', ');
}
