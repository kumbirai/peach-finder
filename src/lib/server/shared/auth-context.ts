import type { SessionId, UserId } from './ids';

export type Role = 'anonymous' | 'seeker' | 'provider' | 'admin';

export class AuthorizationBug extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AuthorizationBug';
	}
}

export interface AuthContext {
	readonly userId: UserId | null;
	readonly role: Role;
	readonly sessionId: SessionId | null;
	readonly ipAddress: string;
	readonly hasRole: (r: Role) => boolean;
	readonly requireRole: (r: Role) => void;
	readonly requireOwnership: (ownerId: UserId) => void;
}

const ROLE_RANK: Record<Role, number> = {
	anonymous: 0,
	seeker: 1,
	provider: 2,
	admin: 3
};

export function roleSatisfies(actual: Role, required: Role): boolean {
	if (required === 'anonymous') return true;
	if (required === 'admin') return actual === 'admin';
	if (required === 'provider') return actual === 'provider';
	if (required === 'seeker') return actual === 'seeker' || actual === 'provider';
	return false;
}

export function createAuthContext(input: {
	userId: UserId | null;
	role: Role;
	sessionId: SessionId | null;
	ipAddress: string;
}): AuthContext {
	const ctx: AuthContext = {
		userId: input.userId,
		role: input.role,
		sessionId: input.sessionId,
		ipAddress: input.ipAddress,
		hasRole: (r) => roleSatisfies(input.role, r),
		requireRole: (r) => {
			if (!roleSatisfies(input.role, r)) {
				throw new AuthorizationBug(`required role ${r}, had ${input.role}`);
			}
		},
		requireOwnership: (ownerId) => {
			if (input.userId !== ownerId) {
				throw new AuthorizationBug('ownership check failed');
			}
		}
	};
	return ctx;
}

export const anonymousAuth = (ipAddress: string): AuthContext =>
	createAuthContext({
		userId: null,
		role: 'anonymous',
		sessionId: null,
		ipAddress
	});

export { ROLE_RANK };
