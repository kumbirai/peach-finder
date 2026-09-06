export const IDENTITY_DOC_RETENTION_MS = 90 * 24 * 60 * 60_000;

/** True when a decided case has reached the 90-day identity-doc retention window. */
export function isIdentityDocPurgeDue(decidedAt: Date, now: Date): boolean {
	return decidedAt.getTime() <= now.getTime() - IDENTITY_DOC_RETENTION_MS;
}
