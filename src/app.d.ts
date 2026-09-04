import type { AuthContext } from '$lib/server/shared/auth-context';

declare global {
	namespace App {
		interface Locals {
			auth: AuthContext;
			correlationId: string;
		}
	}
}

export {};
