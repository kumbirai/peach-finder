export function isUniqueConstraintViolation(error: unknown): boolean {
	let current: unknown = error;
	for (let depth = 0; depth < 6 && current; depth += 1) {
		if (hasPostgresUniqueCode(current)) return true;
		if (
			current instanceof Error &&
			/unique|23505|duplicate key/i.test(`${current.message} ${String(current.cause ?? '')}`)
		) {
			return true;
		}
		current = current instanceof Error ? current.cause : undefined;
	}
	return /unique|23505|duplicate key/i.test(String(error));
}

function hasPostgresUniqueCode(value: unknown): boolean {
	return Boolean(
		value &&
			typeof value === 'object' &&
			'code' in value &&
			(value as { code?: string }).code === '23505'
	);
}
