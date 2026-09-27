import { newId } from '../../../shared/ids';
import {
	anonymousGetStatus,
	anonymousObjectUrl,
	objectStoreConfigFromEnv,
	objectStoreReachable,
	putS3Object,
	type ObjectStoreConfig
} from './s3-path-style';

export type IdentityDocStoreProbeResult = {
	reachable: boolean;
	anonymousUrl: string | null;
	anonymousStatus: number | null;
	deniedAtStore: boolean;
};

export async function probeIdentityDocsAnonymousDenial(
	config: ObjectStoreConfig | null = objectStoreConfigFromEnv(),
	now = new Date()
): Promise<IdentityDocStoreProbeResult> {
	if (!config) {
		return { reachable: false, anonymousUrl: null, anonymousStatus: null, deniedAtStore: false };
	}
	const reachable = await objectStoreReachable(config);
	if (!reachable) {
		return { reachable: false, anonymousUrl: null, anonymousStatus: null, deniedAtStore: false };
	}

	const key = `policy-probe/${now.toISOString().slice(0, 10)}/${newId()}.bin`;
	const body = Buffer.from(`peach-finder-identity-probe-${now.toISOString()}`, 'utf8');
	await putS3Object(config, config.identityDocsBucket, key, body, 'application/octet-stream');
	const anonymousUrl = anonymousObjectUrl(config, config.identityDocsBucket, key);
	const anonymousStatus = await anonymousGetStatus(anonymousUrl);
	return {
		reachable: true,
		anonymousUrl,
		anonymousStatus,
		deniedAtStore: isAnonymousObjectDenied(anonymousStatus)
	};
}

export function isAnonymousObjectDenied(status: number): boolean {
	return status === 403 || status === 404;
}
