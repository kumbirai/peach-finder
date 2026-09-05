import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { messages, pendingMessages, threads } from './infra/schema';

const BOOKING_FIELD_PATTERN =
	/book|slot|calendar|time_slot|appointment|confirmation|conflict|scheduled/i;

describe('US-MSG-03 plain-text arrangement guard', () => {
	it('TC-MSG-03b: direct_messaging schema stores no structured booking fields', () => {
		for (const table of [threads, messages, pendingMessages]) {
			const columnNames = Object.keys(getTableColumns(table));
			for (const name of columnNames) {
				expect(name).not.toMatch(BOOKING_FIELD_PATTERN);
			}
		}

		const messageColumns = Object.keys(getTableColumns(messages));
		expect(messageColumns).toContain('body');
		expect(messageColumns).not.toContain('bookingState');
		expect(messageColumns).not.toContain('proposedSlot');
	});
});
