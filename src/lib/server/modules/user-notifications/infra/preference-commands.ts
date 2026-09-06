import { and, eq } from 'drizzle-orm';
import type { Database, Transaction } from '../../../db';
import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import type { UserId } from '../../../shared/ids';
import {
	getCategoryDefinition,
	isEssentialCategory,
	isValidPreferenceChannel,
	NOTIFICATION_CATEGORIES,
	type NotificationChannel
} from '../domain/categories';
import { notificationPreference } from './schema';

export type PreferenceChannelDto = {
	id: NotificationChannel;
	label: string;
	enabled: boolean;
	mutable: boolean;
};

export type PreferenceCategoryDto = {
	id: string;
	label: string;
	description: string;
	essential: boolean;
	channels: PreferenceChannelDto[];
};

export type NotificationPreferencesDto = {
	categories: PreferenceCategoryDto[];
};

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
	email: 'Email',
	push: 'Push',
	in_app: 'In-app'
};

type PreferenceRow = {
	category: string;
	channel: string;
	enabled: boolean;
};

function channelLabel(channel: NotificationChannel): string {
	return CHANNEL_LABELS[channel];
}

function enabledFromRows(
	rows: PreferenceRow[],
	category: string,
	channel: NotificationChannel
): boolean {
	const row = rows.find((entry) => entry.category === category && entry.channel === channel);
	return row ? row.enabled : true;
}

export async function listPreferenceRows(
	db: Database | Transaction,
	userId: UserId
): Promise<PreferenceRow[]> {
	return db
		.select({
			category: notificationPreference.category,
			channel: notificationPreference.channel,
			enabled: notificationPreference.enabled
		})
		.from(notificationPreference)
		.where(eq(notificationPreference.userId, userId));
}

export async function getNotificationPreferences(
	db: Database,
	userId: UserId
): Promise<NotificationPreferencesDto> {
	const rows = await listPreferenceRows(db, userId);

	return {
		categories: NOTIFICATION_CATEGORIES.map((category) => ({
			id: category.id,
			label: category.label,
			description: category.description,
			essential: category.essential,
			channels: category.channels.map((channel) => ({
				id: channel,
				label: channelLabel(channel),
				enabled: category.essential ? true : enabledFromRows(rows, category.id, channel),
				mutable: !category.essential
			}))
		}))
	};
}

export type PreferenceUpdate = {
	category: string;
	channel: string;
	enabled: boolean;
};

export async function updateNotificationPreferences(
	db: Database,
	userId: UserId,
	updates: PreferenceUpdate[]
): Promise<Result<NotificationPreferencesDto, UseCaseError>> {
	const issues: Array<{ path: string; message: string }> = [];

	for (const [index, update] of updates.entries()) {
		const category = getCategoryDefinition(update.category);
		if (!category) {
			issues.push({ path: `${index}.category`, message: 'Unknown notification category.' });
			continue;
		}
		if (category.essential) {
			issues.push({
				path: `${index}.category`,
				message: 'Billing, security, and moderation notices always deliver.'
			});
			continue;
		}
		if (!isValidPreferenceChannel(update.channel)) {
			issues.push({ path: `${index}.channel`, message: 'Unknown notification channel.' });
			continue;
		}
		if (!category.channels.includes(update.channel)) {
			issues.push({
				path: `${index}.channel`,
				message: 'That channel is not available for this category.'
			});
		}
	}

	if (issues.length > 0) {
		return Err({ kind: 'validation_failed', issues });
	}

	await db.transaction(async (tx) => {
		for (const update of updates) {
			await tx
				.insert(notificationPreference)
				.values({
					userId,
					category: update.category,
					channel: update.channel,
					enabled: update.enabled
				})
				.onConflictDoUpdate({
					target: [
						notificationPreference.userId,
						notificationPreference.category,
						notificationPreference.channel
					],
					set: { enabled: update.enabled }
				});
		}
	});

	return Ok(await getNotificationPreferences(db, userId));
}

export async function isChannelEnabled(
	db: Database | Transaction,
	userId: UserId,
	category: string,
	channel: NotificationChannel
): Promise<boolean> {
	if (isEssentialCategory(category)) {
		return true;
	}

	const rows = await db
		.select({ enabled: notificationPreference.enabled })
		.from(notificationPreference)
		.where(
			and(
				eq(notificationPreference.userId, userId),
				eq(notificationPreference.category, category),
				eq(notificationPreference.channel, channel)
			)
		)
		.limit(1);

	return rows[0]?.enabled ?? true;
}

export async function filterEnabledChannels(
	db: Database | Transaction,
	userId: UserId,
	category: string,
	channels: readonly NotificationChannel[]
): Promise<NotificationChannel[]> {
	if (isEssentialCategory(category)) {
		return [...channels];
	}

	const enabled: NotificationChannel[] = [];
	for (const channel of channels) {
		if (await isChannelEnabled(db, userId, category, channel)) {
			enabled.push(channel);
		}
	}
	return enabled;
}

export async function allOptOutChannelsDisabled(
	db: Database | Transaction,
	userId: UserId,
	category: string
): Promise<boolean> {
	const definition = getCategoryDefinition(category);
	if (!definition || definition.essential) {
		return false;
	}

	for (const channel of definition.channels) {
		if (await isChannelEnabled(db, userId, category, channel)) {
			return false;
		}
	}
	return true;
}
