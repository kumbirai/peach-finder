import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchThreadPoll } from './poll-client';

describe('fetchThreadPoll', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('returns null when poll fails', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
		expect(await fetchThreadPoll('thread-1', null)).toBeNull();
	});

	it('parses poll payload and cursor', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					data: {
						messages: [
							{
								id: 'msg-1',
								threadId: 'thread-1',
								body: 'Full body text',
								sentAt: '2026-09-05T12:00:00Z',
								sender: { id: 'u2', displayName: 'Provider' },
								outboundDeliveryState: null,
								deliveredAt: null,
								readAt: null
							}
						],
						deliveredUpdates: [],
						readUpdates: []
					},
					meta: { nextCursor: 'msg-1' }
				})
			})
		);

		const result = await fetchThreadPoll('thread-1', 'msg-0');
		expect(result?.messages[0]?.body).toBe('Full body text');
		expect(result?.cursor).toBe('msg-1');
	});
});
