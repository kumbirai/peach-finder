export function remainingSeconds(expiresAt: string | null, nowMs: number): number | null {
	if (!expiresAt) return null;
	const deltaMs = new Date(expiresAt).getTime() - nowMs;
	if (deltaMs <= 0) return 0;
	return Math.ceil(deltaMs / 1000);
}
