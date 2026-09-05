/** Human-readable distance to a provider's stated area (FR-SRCH-06). */
export function formatDistanceKm(distanceKm: number): string {
	if (!Number.isFinite(distanceKm) || distanceKm < 0) return '';
	if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`;
	return `${distanceKm < 10 ? distanceKm.toFixed(1) : Math.round(distanceKm).toString()} km`;
}
