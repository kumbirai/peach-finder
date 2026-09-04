import { describe, expect, it } from 'vitest';
import { Err, Ok } from './result';

describe('Result', () => {
	it('wraps success values', () => {
		expect(Ok(1)).toEqual({ ok: true, value: 1 });
	});

	it('wraps errors', () => {
		expect(Err({ kind: 'not_found', resource: 'user' })).toEqual({
			ok: false,
			error: { kind: 'not_found', resource: 'user' }
		});
	});
});
