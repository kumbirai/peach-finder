export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export function validatePassword(password: string): string | null {
	if (password.length < MIN_PASSWORD_LENGTH) {
		return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
	}
	if (password.length > MAX_PASSWORD_LENGTH) {
		return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
	}
	return null;
}

export function validateDisplayName(displayName: string): string | null {
	const trimmed = displayName.trim();
	if (trimmed.length < 2) return 'Display name must be at least 2 characters.';
	if (trimmed.length > 80) return 'Display name must be at most 80 characters.';
	return null;
}

export function validateEmail(email: string): string | null {
	const trimmed = email.trim().toLowerCase();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
		return 'Enter a valid email address.';
	}
	return null;
}
