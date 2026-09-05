import sharp from 'sharp';

/** JPEG with embedded GPS EXIF for SR-MEDIA-03 / TC-PRIV-02b regression tests. */
export async function createGeotaggedJpegFixture(): Promise<Buffer> {
	return sharp({
		create: { width: 120, height: 80, channels: 3, background: '#cc8866' }
	})
		.jpeg()
		.withMetadata({
			exif: {
				IFD0: { Make: 'PeachFixtureCam' },
				IFD3: {
					GPSLatitude: '33/1',
					GPSLatitudeRef: 'S',
					GPSLongitude: '18/1',
					GPSLongitudeRef: 'E'
				}
			}
		})
		.toBuffer();
}

export async function assertNoImageMetadata(bytes: Buffer): Promise<void> {
	const meta = await sharp(bytes).metadata();
	if (meta.exif !== undefined) {
		throw new Error('expected no EXIF metadata');
	}
	if (meta.iptc !== undefined) {
		throw new Error('expected no IPTC metadata');
	}
	if (meta.xmp !== undefined) {
		throw new Error('expected no XMP metadata');
	}
}
