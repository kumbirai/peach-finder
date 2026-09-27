import { describe, expect, it } from 'vitest';
import { exportPayloadHasForbiddenMaterial, stripForbiddenExportKeys } from './export-sanitize';

describe('export-sanitize', () => {
	it('drops PSP refs, secrets, and identity-doc paths', () => {
		const sanitized = stripForbiddenExportKeys({
			listing: { state: 'free_listed', pspCustomerRef: 'CUS_x' },
			media: { objectKey: 'identity-docs/abc/id.jpg', url: '/media/ok.webp' },
			nested: { passwordHash: 'x', displayName: 'Amara' }
		});
		expect(sanitized).toEqual({
			listing: { state: 'free_listed' },
			media: { url: '/media/ok.webp' },
			nested: { displayName: 'Amara' }
		});
		expect(exportPayloadHasForbiddenMaterial(sanitized)).toBe(false);
		expect(exportPayloadHasForbiddenMaterial({ pspAuthorizationCode: 'auth' })).toBe(true);
	});
});
