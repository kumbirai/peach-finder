import type { Database } from '../../../db';
import { getActiveAreaBySlug } from '../../platform-configuration';

export type ResolvedSearchCoords = {
	lat: number | null;
	lng: number | null;
	areaName: string | null;
};

/** Transient viewer position for proximity — never written to storage (FR-PRIV-02). */
export async function resolveSearchCoords(
	db: Database,
	input: { lat?: number; lng?: number; areaSlug?: string }
): Promise<ResolvedSearchCoords> {
	if (
		input.lat != null &&
		input.lng != null &&
		Number.isFinite(input.lat) &&
		Number.isFinite(input.lng)
	) {
		return { lat: input.lat, lng: input.lng, areaName: null };
	}

	const slug = input.areaSlug?.trim();
	if (slug) {
		const area = await getActiveAreaBySlug(db, slug);
		if (area) {
			return {
				lat: area.centroidLat,
				lng: area.centroidLng,
				areaName: area.name
			};
		}
	}

	return { lat: null, lng: null, areaName: null };
}
