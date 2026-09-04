import { describe, expect, it } from 'vitest';
import { asId, InvalidIdError, newId, UUID_V7_RE } from './ids';

describe('branded ids', () => {
	it('mints a UUIDv7', () => {
		const id = newId<'UserId'>();
		expect(UUID_V7_RE.test(id)).toBe(true);
	});

	it('accepts a valid UUIDv7', () => {
		const raw = newId<'UserId'>();
		expect(asId<'UserId'>(raw)).toBe(raw);
	});

	it('rejects a non-v7 uuid', () => {
		expect(() => asId<'UserId'>('not-a-uuid')).toThrow(InvalidIdError);
		expect(() => asId<'UserId'>('00000000-0000-4000-8000-000000000000')).toThrow(InvalidIdError);
	});
});
