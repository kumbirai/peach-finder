export type VariantKind = 'thumb_320' | 'card_640' | 'gallery_1280' | 'archival_2048';

export const VARIANT_SPECS: ReadonlyArray<{ kind: VariantKind; longestEdge: number }> = [
	{ kind: 'thumb_320', longestEdge: 320 },
	{ kind: 'card_640', longestEdge: 640 },
	{ kind: 'gallery_1280', longestEdge: 1280 },
	{ kind: 'archival_2048', longestEdge: 2048 }
];
