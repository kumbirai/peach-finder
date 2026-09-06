import type { ConfigKey } from '$lib/server/modules/platform-configuration';

export type ConfigSectionId =
	'billing' | 'availability' | 'reviews' | 'messaging' | 'notifications' | 'platform';

export type ConfigInputType = 'number' | 'text' | 'textarea' | 'dunning';

export type ConfigFieldMeta = {
	key: ConfigKey;
	label: string;
	section: ConfigSectionId;
	inputType: ConfigInputType;
	help?: string;
	readOnly?: boolean;
};

export const CONFIG_SECTION_LABELS: Record<ConfigSectionId, string> = {
	billing: 'Billing & pricing',
	availability: 'Availability',
	reviews: 'Highly rated threshold',
	messaging: 'Response time',
	notifications: 'Notifications',
	platform: 'Platform'
};

export const CONFIG_FIELDS: ConfigFieldMeta[] = [
	{
		key: 'listing-billing.trial_period_days',
		label: 'Free trial length (days)',
		section: 'billing',
		inputType: 'number',
		help: 'How long new listings stay free before billing starts.'
	},
	{
		key: 'listing-billing.grace_period_days',
		label: 'Grace period (days)',
		section: 'billing',
		inputType: 'number'
	},
	{
		key: 'listing-billing.listing_price_cents',
		label: 'Listing price (ZAR cents)',
		section: 'billing',
		inputType: 'number',
		help: 'Monthly listing renewal in integer cents — never a float.'
	},
	{
		key: 'listing-billing.featuring_price_cents',
		label: 'Featuring price (ZAR cents)',
		section: 'billing',
		inputType: 'number'
	},
	{
		key: 'listing-billing.dunning_offset_days',
		label: 'Dunning schedule (days into grace)',
		section: 'billing',
		inputType: 'dunning',
		help: 'Comma-separated days; each must be less than the grace period.'
	},
	{
		key: 'provider-availability.expiry_minutes',
		label: 'Availability expiry (minutes)',
		section: 'availability',
		inputType: 'number'
	},
	{
		key: 'provider-availability.reminder_lead_minutes',
		label: 'Expiry reminder lead (minutes)',
		section: 'availability',
		inputType: 'number',
		help: 'Must stay shorter than availability expiry.'
	},
	{
		key: 'provider-availability.active_week_window_days',
		label: 'Active-this-week window (days)',
		section: 'availability',
		inputType: 'number',
		readOnly: true,
		help: 'Computed rule — not editable from the console.'
	},
	{
		key: 'provider-reviews.highly_rated_min_average',
		label: 'Minimum average rating',
		section: 'reviews',
		inputType: 'number'
	},
	{
		key: 'provider-reviews.highly_rated_min_reviews',
		label: 'Minimum review count',
		section: 'reviews',
		inputType: 'number'
	},
	{
		key: 'direct-messaging.response_time_window_days',
		label: 'Response-time window (days)',
		section: 'messaging',
		inputType: 'number'
	},
	{
		key: 'user-notifications.batch_window_minutes',
		label: 'Notification batch window (minutes)',
		section: 'notifications',
		inputType: 'number'
	},
	{
		key: 'user-notifications.email_unread_delay_minutes',
		label: 'Email unread delay (minutes)',
		section: 'notifications',
		inputType: 'number'
	},
	{
		key: 'platform-configuration.operating_timezone',
		label: 'Operating timezone (IANA)',
		section: 'platform',
		inputType: 'text'
	},
	{
		key: 'platform-configuration.safety_info_html',
		label: 'Safety page copy (HTML)',
		section: 'platform',
		inputType: 'textarea',
		help: 'Sanitized on save; shown on the public safety page.'
	}
];

/** Config keys whose numeric form values may include a fractional part. */
const FRACTIONAL_CONFIG_KEYS = new Set<ConfigKey>(['provider-reviews.highly_rated_min_average']);

export const LEXICON_ENTRY_TYPE_LABELS: Record<string, string> = {
	service_term: 'Service term',
	language: 'Language',
	intent_availability: 'Availability intent',
	intent_rating: 'Rating intent',
	intent_verification: 'Verification intent',
	intent_proximity: 'Proximity intent',
	synonym: 'Synonym'
};

export function configValueToFormString(key: ConfigKey, value: unknown): string {
	if (key === 'listing-billing.dunning_offset_days' && Array.isArray(value)) {
		return value.join(', ');
	}
	if (key === 'platform-configuration.safety_info_html' && typeof value === 'string') {
		return value;
	}
	return value === undefined || value === null ? '' : String(value);
}

export function parseConfigFormValue(
	key: ConfigKey,
	raw: string
): { ok: true; value: unknown } | { ok: false; message: string } {
	const trimmed = raw.trim();
	if (key === 'listing-billing.dunning_offset_days') {
		if (!trimmed) {
			return { ok: false, message: 'Enter at least one day offset.' };
		}
		const parts = trimmed.split(',').map((part) => part.trim());
		if (parts.some((part) => !/^\d+$/.test(part))) {
			return { ok: false, message: 'Use comma-separated whole numbers.' };
		}
		return { ok: true, value: parts.map((part) => Number.parseInt(part, 10)) };
	}
	if (key === 'platform-configuration.safety_info_html') {
		if (!trimmed) return { ok: false, message: 'Safety copy cannot be empty.' };
		return { ok: true, value: trimmed };
	}
	if (key === 'platform-configuration.operating_timezone') {
		if (!trimmed) return { ok: false, message: 'Enter a timezone.' };
		return { ok: true, value: trimmed };
	}
	if (!trimmed) {
		return { ok: false, message: 'Enter a value.' };
	}
	const number = Number(trimmed);
	if (!Number.isFinite(number)) {
		return { ok: false, message: 'Enter a valid number.' };
	}
	if (!FRACTIONAL_CONFIG_KEYS.has(key) && !Number.isInteger(number)) {
		return { ok: false, message: 'Enter a whole number.' };
	}
	return { ok: true, value: number };
}

export function defaultMapsToForLexiconType(
	entryType: string,
	serviceTagId?: string
): Record<string, unknown> {
	switch (entryType) {
		case 'service_term':
			return { serviceTagId: serviceTagId ?? '' };
		case 'language':
			return { language: 'en' };
		case 'intent_availability':
			return { filter: 'available_now' };
		case 'intent_rating':
			return { filter: 'highly_rated' };
		case 'intent_verification':
			return { filter: 'verified' };
		case 'intent_proximity':
			return { filter: 'near_me' };
		case 'synonym':
			return { of: '' };
		default:
			return {};
	}
}
