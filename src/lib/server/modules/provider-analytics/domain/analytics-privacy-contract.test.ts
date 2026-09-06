import { describe, expect, it } from 'vitest';
import {
	assertAggregateOnlyPayload,
	findForbiddenIdentifyingKeys
} from './analytics-privacy-contract';

describe('analytics privacy contract', () => {
	it('TC-ANLY-02a: allows aggregate-only dashboard shapes', () => {
		const payload = {
			profileViews: {
				currentTotal: '< 5',
				trend: [{ date: '2026-09-05', value: '< 5' }],
				priorPeriodComparison: {
					priorTotal: '< 5',
					changeLabel: 'Same as prior period',
					direction: 'flat'
				}
			},
			mostSearchedServices: [{ tagId: 'tag-1', tag: 'Deep tissue', demandRank: 1, isMine: true }]
		};
		expect(findForbiddenIdentifyingKeys(payload)).toEqual([]);
		assertAggregateOnlyPayload(payload);
	});

	it('TC-ANLY-02a: rejects payloads that expose viewer or seeker identity', () => {
		const payload = {
			profileViews: { currentTotal: '3', viewers: [{ seekerId: 'x', email: 'a@b.com' }] }
		};
		expect(findForbiddenIdentifyingKeys(payload)).toEqual(
			expect.arrayContaining(['viewers', 'seekerId', 'email'])
		);
		expect(() => assertAggregateOnlyPayload(payload)).toThrow(/identifying fields/);
	});
});
