import { and, eq, isNull, gt } from 'drizzle-orm';
import type { Database } from '../../db';
import { sessions, users } from './infra/schema';
import {
	anonymousAuth,
	createAuthContext,
	type AuthContext,
	type Role
} from '../../shared/auth-context';
import { asId, type SessionId, type UserId } from '../../shared/ids';
import { ownsProfile, ownsProfileDb } from '../provider-profile';
import type { CapabilitiesDto } from './app/capabilities-types';
import { hashSessionToken, newSessionToken, SEEKER_IDLE_MS } from './infra/session-commands';
import { ADMIN_SESSION_IDLE_MS } from './domain/session-policy';

export { exportFor } from './export-stub';
export { buildSignInUrl, gatedActionHref } from './app/sign-in-url';
export { resolveProfileActionHrefs, type ProfileActionHrefs } from './app/profile-action-hrefs';
export type { CapabilitiesDto } from './app/capabilities-types';
export { setSessionCookie, clearSessionCookie, SESSION_COOKIE } from './app/session-cookie';
export { parseGatedAction, type GatedAction, type SignInIntent } from './domain/sign-in-intent';
export { buildPostAuthRedirect } from './domain/post-auth-redirect';
export {
	getDisplayIdentity,
	getContactPhone,
	getSelfAccountSummary
} from './infra/display-identity';
export {
	getVerifiedPhoneHash,
	getPhoneVerifiedAt,
	wasPhoneUsedBefore
} from './infra/phone-registry-read';
export {
	searchAccounts,
	getAccountSummary,
	type AccountSearchHit,
	type AccountSummary
} from './infra/account-lookup';
export {
	getRegistrationStats,
	type DateRange,
	type RegistrationStats
} from './infra/registration-stats';
export {
	registerSeeker,
	loginPassword,
	verifyEmailToken,
	isEmailVerified,
	findOAuthLink,
	createOAuthUser,
	linkOAuthToUser,
	requestPasswordReset,
	completePasswordReset,
	reauthWithPassword,
	changePassword,
	type RegisterSeekerInput,
	type LoginPasswordResult
} from './infra/auth-commands';
export {
	verifyAdminPassword,
	completeAdminLogin,
	type VerifyAdminPasswordResult
} from './infra/admin-auth-commands';
export {
	hasAdminTotpEnrollment,
	loadAdminTotpSecret,
	beginAdminTotpEnrollment
} from './infra/admin-totp-commands';
export {
	issueAdminLoginChallenge,
	readAdminLoginChallenge,
	clearAdminLoginChallenge,
	ADMIN_CHALLENGE_COOKIE,
	type AdminLoginChallenge
} from './app/admin-login-challenge';
export { generateTotpCode } from './domain/totp';
export {
	registerProvider,
	requestOtp,
	verifyOtp,
	isPhoneVerified,
	type RegisterProviderInput,
	type RegisterProviderResult,
	type RequestOtpInput,
	type VerifyOtpInput,
	type VerifyOtpResult
} from './infra/otp-commands';
export {
	getDevVerificationToken,
	getDevPasswordResetToken,
	getDevOtpCode,
	findUserIdByEmail
} from './infra/dev-verification';
import { deleteAccount, anonymizePendingUsers } from './infra/account-deletion';
export { deleteAccount, anonymizePendingUsers };
export { applySuspension, applyReinstatement } from './infra/suspension-commands';
export { updateDisplayName } from './infra/account-commands';
import { getUserCapabilities } from './infra/session-commands';
export { ADMIN_SESSION_IDLE_MS } from './domain/session-policy';
export {
	createSession,
	createAdminSession,
	getUserCapabilities,
	revokeSession,
	revokeOtherSessionsForUser,
	revokeAllSessionsForUser
} from './infra/session-commands';
export { hasSignedInSince } from './infra/session-activity-read';
export {
	buildGoogleAuthUrl,
	googleRedirectUri,
	isGoogleOAuthConfigured,
	newOAuthState,
	newPkceVerifier,
	oauthPkceCookieName,
	oauthStateCookieName,
	pkceChallenge,
	exchangeGoogleCode,
	fetchGoogleUserInfo,
	type GoogleUserInfo
} from './infra/oauth-google';
import { randomBytes } from 'node:crypto';

export const ANON_COOKIE = 'pf_anon';
export const ADMIN_IDLE_MS = ADMIN_SESSION_IDLE_MS;
export const LAST_SEEN_THROTTLE_MS = 60 * 60_000;
export { SEEKER_IDLE_MS, hashSessionToken, newSessionToken };

export function newAnonId(): string {
	return randomBytes(16).toString('hex');
}

export type SessionUser = {
	sessionId: SessionId;
	userId: UserId;
	isAdmin: boolean;
	status: string;
	lastSeenAt: Date;
	expiresAt: Date;
};

export async function findActiveSession(
	db: Database,
	token: string,
	now: Date
): Promise<SessionUser | null> {
	const tokenHash = hashSessionToken(token);
	const rows = await db
		.select({
			sessionId: sessions.id,
			userId: sessions.userId,
			lastSeenAt: sessions.lastSeenAt,
			expiresAt: sessions.expiresAt,
			isAdmin: users.isAdmin,
			status: users.status
		})
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(
			and(
				eq(sessions.tokenHash, tokenHash),
				isNull(sessions.revokedAt),
				gt(sessions.expiresAt, now)
			)
		)
		.limit(1);

	const row = rows[0];
	if (!row) return null;
	return {
		sessionId: asId<'SessionId'>(row.sessionId),
		userId: asId<'UserId'>(row.userId),
		isAdmin: row.isAdmin,
		status: row.status,
		lastSeenAt: row.lastSeenAt,
		expiresAt: row.expiresAt
	};
}

export async function maybeTouchSession(
	db: Database,
	session: SessionUser,
	now: Date
): Promise<void> {
	if (now.getTime() - session.lastSeenAt.getTime() < LAST_SEEN_THROTTLE_MS) return;
	const idle = session.isAdmin ? ADMIN_IDLE_MS : SEEKER_IDLE_MS;
	await db
		.update(sessions)
		.set({
			lastSeenAt: now,
			expiresAt: new Date(now.getTime() + idle)
		})
		.where(eq(sessions.id, session.sessionId));
}

export async function resolveRole(input: {
	session: SessionUser | null;
	routeRequiredRole: Role;
}): Promise<{ role: Role; forbidden: boolean; unauthenticated: boolean }> {
	if (!input.session || input.session.status !== 'active') {
		if (input.routeRequiredRole === 'anonymous') {
			return { role: 'anonymous', forbidden: false, unauthenticated: false };
		}
		return { role: 'anonymous', forbidden: false, unauthenticated: true };
	}

	if (input.session.isAdmin) {
		if (input.routeRequiredRole === 'admin' || input.routeRequiredRole === 'anonymous') {
			return { role: 'admin', forbidden: false, unauthenticated: false };
		}
		return { role: 'admin', forbidden: true, unauthenticated: false };
	}

	if (input.routeRequiredRole === 'admin') {
		return { role: 'seeker', forbidden: true, unauthenticated: false };
	}

	if (input.routeRequiredRole === 'provider') {
		const owns = await ownsProfile(input.session.userId);
		if (!owns) return { role: 'seeker', forbidden: true, unauthenticated: false };
		return { role: 'provider', forbidden: false, unauthenticated: false };
	}

	return { role: 'seeker', forbidden: false, unauthenticated: false };
}

export async function buildAuthContext(input: {
	db: Database;
	sessionToken: string | undefined;
	routeRequiredRole: Role;
	ipAddress: string;
	now: Date;
}): Promise<{ auth: AuthContext; forbidden: boolean; unauthenticated: boolean }> {
	const session = input.sessionToken
		? await findActiveSession(input.db, input.sessionToken, input.now)
		: null;
	const resolved = await resolveRole({
		session,
		routeRequiredRole: input.routeRequiredRole
	});
	if (session && !resolved.unauthenticated) {
		await maybeTouchSession(input.db, session, input.now);
	}
	if (!session || resolved.role === 'anonymous') {
		return {
			auth: anonymousAuth(input.ipAddress),
			forbidden: resolved.forbidden,
			unauthenticated: resolved.unauthenticated
		};
	}
	return {
		auth: createAuthContext({
			userId: session.userId,
			role: resolved.role,
			sessionId: session.sessionId,
			ipAddress: input.ipAddress
		}),
		forbidden: resolved.forbidden,
		unauthenticated: resolved.unauthenticated
	};
}

export async function resolveCapabilities(db: Database, userId: UserId): Promise<CapabilitiesDto> {
	const isProvider = await ownsProfileDb(db, userId);
	return getUserCapabilities(db, userId, isProvider);
}
