import { describe, expect, it } from 'vitest';
import { demandTagOwnershipLabel, highlightOwnServiceTags } from './demand-signal';

describe('demand-signal', () => {
	it('TC-ANLY-03a: labels distinguish owned vs unowned tags without relying on color alone', () => {
		expect(demandTagOwnershipLabel(true)).toBe('Your tag');
		expect(demandTagOwnershipLabel(false)).toBe('Not on your profile');
	});

	it('TC-ANLY-03a: highlights provider-owned tags in platform demand ranking', () => {
		const rows = [
			{ tagId: 'tag-deep', tag: 'Deep tissue', demandRank: 1 },
			{ tagId: 'tag-swedish', tag: 'Swedish', demandRank: 2 }
		];
		const highlighted = highlightOwnServiceTags(rows, new Set(['tag-swedish']));
		expect(highlighted[0]?.isMine).toBe(false);
		expect(highlighted[1]?.isMine).toBe(true);
	});
});
