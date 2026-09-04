import type { Handle } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { getDb } from '$lib/server/db';
import { bootApp } from '$lib/server/boot';
import { requiredRoleFor } from '$lib/server/rbac/route-roles';
import { rbacFailure } from '$lib/server/rbac/authorize';
import {
	ANON_COOKIE,
	SESSION_COOKIE,
	buildAuthContext,
	newAnonId
} from '$lib/server/modules/identity-and-access';
import { anonymousAuth, AuthorizationBug } from '$lib/server/shared/auth-context';
import { internalHttp } from '$lib/server/shared/api';
import { log } from '$lib/server/shared/logger';

const CSP = [
	"default-src 'self'",
	"script-src 'self'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob:",
	"font-src 'self'",
	"connect-src 'self' ws: wss:",
	"frame-ancestors 'none'",
	"base-uri 'self'",
	"form-action 'self'"
].join('; ');

function clientIp(event: Parameters<Handle>[0]['event']): string {
	return event.request.headers.get('cf-connecting-ip') ?? event.getClientAddress();
}

export const handle: Handle = async ({ event, resolve }) => {
	await bootApp();

	const correlationId = event.request.headers.get('x-correlation-id') ?? randomUUID();
	event.locals.correlationId = correlationId;

	const routeRole = requiredRoleFor(event.route.id);
	const sessionToken = event.cookies.get(SESSION_COOKIE);
	const now = new Date();

	try {
		const { auth, forbidden, unauthenticated } = await buildAuthContext({
			db: getDb(),
			sessionToken,
			routeRequiredRole: routeRole,
			ipAddress: clientIp(event),
			now
		});
		event.locals.auth = auth;

		const denied = rbacFailure({ unauthenticated, forbidden });
		if (denied) {
			return json(denied.body, {
				status: denied.status,
				headers: securityHeaders(event, correlationId)
			});
		}
	} catch (error) {
		log('error', 'auth hook failed', {
			correlationId,
			err: error instanceof Error ? error.message : 'unknown'
		});
		event.locals.auth = anonymousAuth(clientIp(event));
		const mapped = internalHttp();
		return json(mapped.body, {
			status: mapped.status,
			headers: securityHeaders(event, correlationId)
		});
	}

	const method = event.request.method.toUpperCase();
	if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
		const origin = event.request.headers.get('origin');
		if (origin && origin !== event.url.origin) {
			return json(
				{ error: { code: 'FORBIDDEN', message: 'You cannot do that.', fields: null } },
				{ status: 403, headers: securityHeaders(event, correlationId) }
			);
		}
	}

	if (!event.cookies.get(ANON_COOKIE)) {
		event.cookies.set(ANON_COOKIE, newAnonId(), {
			path: '/',
			httpOnly: true,
			secure: event.url.protocol === 'https:',
			sameSite: 'lax',
			maxAge: 86_400
		});
	}

	try {
		const response = await resolve(event);
		applySecurityHeaders(response, event, correlationId);
		response.headers.set('x-correlation-id', correlationId);
		return response;
	} catch (error) {
		if (error instanceof AuthorizationBug) {
			log('error', 'authorization bug', { correlationId });
			const mapped = internalHttp();
			return json(mapped.body, {
				status: mapped.status,
				headers: securityHeaders(event, correlationId)
			});
		}
		throw error;
	}
};

function securityHeaders(
	event: Parameters<Handle>[0]['event'],
	correlationId: string
): HeadersInit {
	return {
		'content-security-policy': cspFor(event),
		'x-content-type-options': 'nosniff',
		'referrer-policy': 'strict-origin-when-cross-origin',
		'permissions-policy': 'camera=(), microphone=(), geolocation=()',
		'x-correlation-id': correlationId
	};
}

function applySecurityHeaders(
	response: Response,
	event: Parameters<Handle>[0]['event'],
	_correlationId: string
): void {
	response.headers.set('content-security-policy', cspFor(event));
	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
	response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
}

function cspFor(event: Parameters<Handle>[0]['event']): string {
	if (event.url.pathname.startsWith('/search')) {
		return CSP.replace('geolocation=()', 'geolocation=(self)');
	}
	return CSP;
}
