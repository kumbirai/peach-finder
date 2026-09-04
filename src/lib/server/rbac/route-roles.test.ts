import { describe, expect, it } from 'vitest';
import { requiredRoleFor } from './route-roles';

describe('requiredRoleFor', () => {
	it('defaults the homepage to anonymous', () => {
		expect(requiredRoleFor('/')).toBe('anonymous');
	});

	it('reads seeker from the session ping route', () => {
		expect(requiredRoleFor('/api/session/ping')).toBe('seeker');
	});

	it('inherits admin from the admin layout', () => {
		expect(requiredRoleFor('/admin')).toBe('admin');
		expect(requiredRoleFor('/admin/api/platform/config')).toBe('admin');
	});
});
