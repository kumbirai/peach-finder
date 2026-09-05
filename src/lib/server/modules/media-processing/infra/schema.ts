import { bigint, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { pgSchema } from 'drizzle-orm/pg-core';

export const mediaProcessingSchema = pgSchema('media_processing');

export const photos = mediaProcessingSchema.table('photo', {
	id: uuid('id').primaryKey(),
	ownerId: uuid('owner_id').notNull(),
	bucket: text('bucket').notNull().default('media'),
	objectKey: text('object_key'),
	contentHash: text('content_hash'),
	status: text('status').notNull().default('pending'),
	mimeType: text('mime_type'),
	sizeBytes: bigint('size_bytes', { mode: 'number' }),
	failedReason: text('failed_reason'),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
});

export const photoVariants = mediaProcessingSchema.table(
	'photo_variant',
	{
		photoId: uuid('photo_id')
			.notNull()
			.references(() => photos.id, { onDelete: 'cascade' }),
		variant: text('variant').notNull(),
		url: text('url').notNull(),
		width: integer('width').notNull(),
		height: integer('height').notNull()
	},
	(table) => [{ pk: { columns: [table.photoId, table.variant] } }]
);
