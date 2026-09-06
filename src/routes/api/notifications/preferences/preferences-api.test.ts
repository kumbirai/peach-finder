import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const BodySchema = z.object({
	updates: z
		.array(
			z.object({
				category: z.string().min(1),
				channel: z.string().min(1),
				enabled: z.boolean()
			})
		)
		.min(1)
});

describe('PUT /api/notifications/preferences body validation', () => {
	it('rejects malformed JSON bodies via null parse fallback', () => {
		const parsed = BodySchema.safeParse(null);
		expect(parsed.success).toBe(false);
	});

	it('rejects empty updates arrays', () => {
		const parsed = BodySchema.safeParse({ updates: [] });
		expect(parsed.success).toBe(false);
	});

	it('accepts a single preference update', () => {
		const parsed = BodySchema.safeParse({
			updates: [{ category: 'new_message', channel: 'push', enabled: false }]
		});
		expect(parsed.success).toBe(true);
	});
});
