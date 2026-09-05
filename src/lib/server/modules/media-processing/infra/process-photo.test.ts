import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { encodeVariants, assertDecodable } from '../infra/process-photo';

describe('process-photo EXIF strip', () => {
	it('strips metadata from every generated variant (TC-PONB-03c)', async () => {
		const source = await sharp({
			create: { width: 120, height: 80, channels: 3, background: '#cc8866' }
		})
			.jpeg()
			.toBuffer();

		expect(await assertDecodable(source)).toBe(true);

		const variants = await encodeVariants(source);
		expect(variants.length).toBeGreaterThan(0);

		for (const variant of variants) {
			const meta = await sharp(variant.bytes).metadata();
			expect(meta.exif).toBeUndefined();
			expect(meta.iptc).toBeUndefined();
			expect(meta.xmp).toBeUndefined();
		}
	});
});
