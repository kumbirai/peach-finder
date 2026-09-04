import type { Role } from '../shared/auth-context';

type RoleModule = { _requiredRole?: Role };

const pageModules = import.meta.glob('../../../routes/**/+page.server.ts', {
	eager: true
}) as Record<string, RoleModule>;
const serverModules = import.meta.glob('../../../routes/**/+server.ts', {
	eager: true
}) as Record<string, RoleModule>;
const layoutModules = import.meta.glob('../../../routes/**/+layout.server.ts', {
	eager: true
}) as Record<string, RoleModule>;

function normalize(key: string): string {
	return key.replaceAll('\\', '/');
}

function roleFrom(modules: Record<string, RoleModule>, needle: string): Role | undefined {
	for (const [key, mod] of Object.entries(modules)) {
		if (normalize(key).endsWith(needle)) {
			return mod._requiredRole;
		}
	}
	return undefined;
}

export function requiredRoleFor(routeId: string | null): Role {
	if (!routeId) return 'anonymous';

	const pageRole = roleFrom(
		pageModules,
		routeId === '/' ? '/routes/+page.server.ts' : `/routes${routeId}/+page.server.ts`
	);
	if (pageRole) return pageRole;

	const serverRole = roleFrom(
		serverModules,
		routeId === '/' ? '/routes/+server.ts' : `/routes${routeId}/+server.ts`
	);
	if (serverRole) return serverRole;

	const segments = (routeId === '/' ? '' : routeId).split('/').filter(Boolean);
	for (let i = segments.length; i >= 0; i--) {
		const layoutNeedle =
			i === 0
				? '/routes/+layout.server.ts'
				: `/routes/${segments.slice(0, i).join('/')}/+layout.server.ts`;
		const role = roleFrom(layoutModules, layoutNeedle);
		if (role) return role;
	}
	return 'anonymous';
}
