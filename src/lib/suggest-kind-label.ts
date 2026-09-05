const KIND_LABELS: Record<string, string> = {
	service: 'Service',
	service_term: 'Service',
	area: 'Area',
	intent: 'Intent',
	language: 'Language'
};

export function suggestKindLabel(kind: string): string {
	return KIND_LABELS[kind] ?? kind;
}
