import type { Database } from '../../../db';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import type { AreaId } from '../../../shared/ids';
import { getActiveAreaById } from '../../platform-configuration';

export async function requireActiveRegistrationArea(
	db: Database,
	areaId: string
): Promise<Result<AreaId, UseCaseError>> {
	const area = areaId ? await getActiveAreaById(db, areaId) : null;
	if (!area) {
		return Err({
			kind: 'validation_failed',
			issues: [{ path: 'areaId', message: 'Choose your general service area.' }]
		});
	}
	return Ok(area.id as AreaId);
}
