import { describe, expect, it } from 'vitest';
import { latestMessageId, mergeThreadMessages } from './thread-messages';
import type { ThreadMessage } from './types';

const base = (id: string, sentAt: string): ThreadMessage => ({
	id,
	threadId: 't1',
	body: id,
	sentAt,
	sender: { id: 'u1', displayName: 'A' },
	outboundDeliveryState: null,
	deliveredAt: null,
	readAt: null
});

describe('thread-messages', () => {
	it('merges by id without duplicates', () => {
		const merged = mergeThreadMessages(
			[base('a', '2026-09-05T10:00:00Z')],
			[base('a', '2026-09-05T10:00:00Z'), base('b', '2026-09-05T10:01:00Z')]
		);
		expect(merged).toHaveLength(2);
		expect(latestMessageId(merged)).toBe('b');
	});

	it('replaces a preview body with the full poll body for the same id', () => {
		const preview = base('long', '2026-09-05T10:00:00Z');
		preview.body = `${'x'.repeat(140)}…`;
		const full = base('long', '2026-09-05T10:00:00Z');
		full.body = 'x'.repeat(200);
		const merged = mergeThreadMessages([preview], [full]);
		expect(merged[0]?.body).toBe(full.body);
	});
});
