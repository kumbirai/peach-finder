import { createHash, randomBytes } from 'node:crypto';
import type { AuthContext } from '../../../shared/auth-context';
import { ANON_COOKIE } from '../../identity-and-access';

function viewerKeySalt(): string {
	return (
		process.env.ANALYTICS_VIEWER_KEY_SALT?.trim() ||
		process.env.DATABASE_URL?.trim() ||
		'peach-finder-dev-analytics-salt'
	);
}

function utcDateKey(instant: Date): string {
	return instant.toISOString().slice(0, 10);
}

export function deriveViewerKey(
	auth: AuthContext,
	anonCookieValue: string | undefined,
	occurredAt: Date,
	fallbackRandom?: string
): string {
	const dateKey = utcDateKey(occurredAt);
	const source =
		auth.sessionId != null
			? `session:${auth.sessionId}`
			: anonCookieValue
				? `anon:${anonCookieValue}`
				: `ephemeral:${fallbackRandom ?? randomBytes(16).toString('hex')}`;

	return createHash('sha256').update(`${viewerKeySalt()}|${source}|${dateKey}`).digest('hex');
}

export { ANON_COOKIE };
