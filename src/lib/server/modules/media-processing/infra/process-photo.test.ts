import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { encodeVariants, assertDecodable } from '../infra/process-photo';
import { assertNoImageMetadata, createGeotaggedJpegFixture } from '../test-support/geotagged-jpeg';

describe('process-photo EXIF strip', () => {
	it('strips metadata from every generated variant (TC-PONB-03c / TC-PRIV-02b)', async () => {
		const source = await createGeotaggedJpegFixture();
		const sourceMeta = await sharp(source).metadata();
		expect(sourceMeta.exif?.length).toBeGreaterThan(0);

		expect(await assertDecodable(source)).toBe(true);

		const variants = await encodeVariants(source);
		expect(variants.length).toBeGreaterThan(0);

		for (const variant of variants) {
			await assertNoImageMetadata(variant.bytes);
		}
	});
});
