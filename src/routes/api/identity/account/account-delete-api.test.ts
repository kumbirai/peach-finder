import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const BodySchema = z.object({
	password: z.string().min(1),
	confirm: z.literal(true)
});

describe('DELETE /api/identity/account body validation', () => {
	it('reports only confirm when password is present but confirm is false', () => {
		const parsed = BodySchema.safeParse({ password: 'password123', confirm: false });
		expect(parsed.success).toBe(false);
		if (parsed.success) return;

		const fields = parsed.error.issues.map((issue) => ({
			path: issue.path.join('.'),
			message: issue.message
		}));

		expect(fields).toEqual([{ path: 'confirm', message: 'Invalid literal value, expected true' }]);
	});

	it('reports password when confirm is true but password is empty', () => {
		const parsed = BodySchema.safeParse({ password: '', confirm: true });
		expect(parsed.success).toBe(false);
		if (parsed.success) return;

		const fields = parsed.error.issues.map((issue) => ({
			path: issue.path.join('.'),
			message: issue.message
		}));

		expect(fields).toEqual([
			{ path: 'password', message: 'String must contain at least 1 character(s)' }
		]);
	});
});
