import { describe, expect, it } from 'vitest';
import {
	anonymousObjectUrl,
	objectStoreConfigFromEnv,
	signS3Request,
	splitStoredObjectKey
} from './s3-path-style';

const config = {
	endpoint: 'http://127.0.0.1:9000',
	accessKey: 'peachfinder',
	secretKey: 'peachfinder-dev-secret',
	region: 'us-east-1',
	mediaBucket: 'media',
	identityDocsBucket: 'identity-docs'
};

describe('s3-path-style', () => {
	it('reads MinIO config from env and ignores a trailing slash', () => {
		expect(
			objectStoreConfigFromEnv({
				MINIO_ENDPOINT: 'http://127.0.0.1:9000/',
				MINIO_ACCESS_KEY: 'peachfinder',
				MINIO_SECRET_KEY: 'secret'
			})
		).toMatchObject({ endpoint: 'http://127.0.0.1:9000', identityDocsBucket: 'identity-docs' });
		expect(objectStoreConfigFromEnv({})).toBeNull();
	});

	it('maps identity-docs object keys onto the private bucket', () => {
		expect(splitStoredObjectKey('identity-docs/abc/id.jpg', config)).toEqual({
			bucket: 'identity-docs',
			key: 'abc/id.jpg'
		});
		expect(splitStoredObjectKey('hash/card_640.webp', config)).toEqual({
			bucket: 'media',
			key: 'hash/card_640.webp'
		});
	});

	it('builds a path-style anonymous URL and a SigV4 PUT', () => {
		const url = anonymousObjectUrl(config, 'identity-docs', 'probe/key.bin');
		expect(url).toBe('http://127.0.0.1:9000/identity-docs/probe/key.bin');
		const signed = signS3Request({
			config,
			method: 'PUT',
			bucket: 'identity-docs',
			key: 'probe/key.bin',
			body: Buffer.from('secret-bytes'),
			now: new Date('2026-09-27T12:00:00.000Z')
		});
		expect(signed.url).toBe(url);
		expect(signed.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=peachfinder\//);
		expect(signed.headers['x-amz-content-sha256']).toHaveLength(64);
	});
});
