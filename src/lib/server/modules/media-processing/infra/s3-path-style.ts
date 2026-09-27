import { createHash, createHmac } from 'node:crypto';

export type ObjectStoreConfig = {
	endpoint: string;
	accessKey: string;
	secretKey: string;
	region: string;
	mediaBucket: string;
	identityDocsBucket: string;
};

export function objectStoreConfigFromEnv(
	env: NodeJS.ProcessEnv = process.env
): ObjectStoreConfig | null {
	const endpoint = env.MINIO_ENDPOINT?.replace(/\/$/, '');
	const accessKey = env.MINIO_ACCESS_KEY;
	const secretKey = env.MINIO_SECRET_KEY;
	if (!endpoint || !accessKey || !secretKey) return null;
	return {
		endpoint,
		accessKey,
		secretKey,
		region: env.MINIO_REGION ?? 'us-east-1',
		mediaBucket: env.MINIO_MEDIA_BUCKET ?? 'media',
		identityDocsBucket: env.MINIO_IDENTITY_DOCS_BUCKET ?? 'identity-docs'
	};
}

export function splitStoredObjectKey(
	objectKey: string,
	config: ObjectStoreConfig
): { bucket: string; key: string } {
	const normalized = objectKey.replaceAll('\\', '/').replace(/^\//, '');
	if (normalized.startsWith(`${config.identityDocsBucket}/`)) {
		return {
			bucket: config.identityDocsBucket,
			key: normalized.slice(config.identityDocsBucket.length + 1)
		};
	}
	if (normalized.startsWith(`${config.mediaBucket}/`)) {
		return { bucket: config.mediaBucket, key: normalized.slice(config.mediaBucket.length + 1) };
	}
	if (normalized.startsWith('identity-docs/')) {
		return { bucket: config.identityDocsBucket, key: normalized.slice('identity-docs/'.length) };
	}
	return { bucket: config.mediaBucket, key: normalized };
}

export function anonymousObjectUrl(config: ObjectStoreConfig, bucket: string, key: string): string {
	return `${config.endpoint}/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

function sha256Hex(data: Buffer | string): string {
	return createHash('sha256').update(data).digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
	return createHmac('sha256', key).update(data, 'utf8').digest();
}

function amzDate(now: Date): { amz: string; dateStamp: string } {
	const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
	return { amz: iso, dateStamp: iso.slice(0, 8) };
}

function signingKey(secret: string, dateStamp: string, region: string): Buffer {
	const kDate = hmac(`AWS4${secret}`, dateStamp);
	const kRegion = hmac(kDate, region);
	const kService = hmac(kRegion, 's3');
	return hmac(kService, 'aws4_request');
}

export function signS3Request(input: {
	config: ObjectStoreConfig;
	method: 'GET' | 'PUT' | 'HEAD' | 'DELETE';
	bucket: string;
	key: string;
	body: Buffer;
	contentType?: string;
	now?: Date;
}): { url: string; headers: Record<string, string> } {
	const { config, method, bucket, key, body } = input;
	const now = input.now ?? new Date();
	const { amz, dateStamp } = amzDate(now);
	const payloadHash = sha256Hex(body);
	const host = new URL(config.endpoint).host;
	const canonicalUri = `/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
	const contentType = input.contentType ?? 'application/octet-stream';
	const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
	const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amz}\n`;
	const canonicalRequest = [
		method,
		canonicalUri,
		'',
		canonicalHeaders,
		signedHeaders,
		payloadHash
	].join('\n');
	const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
	const stringToSign = [
		'AWS4-HMAC-SHA256',
		amz,
		scope,
		sha256Hex(canonicalRequest)
	].join('\n');
	const signature = hmac(signingKey(config.secretKey, dateStamp, config.region), stringToSign).toString(
		'hex'
	);
	const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
	const headers: Record<string, string> = {
		host,
		authorization,
		'x-amz-content-sha256': payloadHash,
		'x-amz-date': amz
	};
	if (method === 'PUT') {
		headers['content-type'] = contentType;
		headers['content-length'] = String(body.length);
	}
	return { url: `${config.endpoint}${canonicalUri}`, headers };
}

export async function putS3Object(
	config: ObjectStoreConfig,
	bucket: string,
	key: string,
	body: Buffer,
	contentType = 'application/octet-stream'
): Promise<void> {
	const signed = signS3Request({ config, method: 'PUT', bucket, key, body, contentType });
	const response = await fetch(signed.url, {
		method: 'PUT',
		headers: signed.headers,
		body
	});
	if (!response.ok) {
		throw new Error(`object store PUT ${bucket}/${key} failed: ${response.status}`);
	}
}

export async function anonymousGetStatus(url: string): Promise<number> {
	const response = await fetch(url, { method: 'GET', redirect: 'manual' });
	return response.status;
}

export async function objectStoreReachable(config: ObjectStoreConfig): Promise<boolean> {
	try {
		const live = await fetch(`${config.endpoint}/minio/health/live`, {
			method: 'GET'
		});
		return live.ok;
	} catch {
		return false;
	}
}
