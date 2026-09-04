import { z } from 'zod';

const ianaTz = z.string().refine((value) => {
	try {
		Intl.DateTimeFormat('en-US', { timeZone: value });
		return true;
	} catch {
		return false;
	}
}, 'Enter a valid IANA timezone.');

export const ConfigRegistry = {
	'listing-billing.trial_period_days': z.number().int().positive(),
	'listing-billing.grace_period_days': z.number().int().positive(),
	'listing-billing.listing_price_cents': z.number().int().nonnegative(),
	'listing-billing.featuring_price_cents': z.number().int().nonnegative(),
	'listing-billing.dunning_offset_days': z.array(z.number().int().nonnegative()),
	'provider-availability.expiry_minutes': z.number().int().positive(),
	'provider-availability.reminder_lead_minutes': z.number().int().positive(),
	'provider-availability.active_week_window_days': z.number().int().positive(),
	'provider-reviews.highly_rated_min_average': z.number().min(1).max(5),
	'provider-reviews.highly_rated_min_reviews': z.number().int().nonnegative(),
	'direct-messaging.response_time_window_days': z.number().int().positive(),
	'user-notifications.batch_window_minutes': z.number().int().positive(),
	'user-notifications.email_unread_delay_minutes': z.number().int().positive(),
	'platform-configuration.operating_timezone': ianaTz,
	'platform-configuration.safety_info_html': z.string().min(1)
} as const;

export type ConfigKey = keyof typeof ConfigRegistry;
export type ConfigValue<K extends ConfigKey> = z.infer<(typeof ConfigRegistry)[K]>;

export const CONFIG_DEFAULTS: { [K in ConfigKey]: ConfigValue<K> } = {
	'listing-billing.trial_period_days': 14,
	'listing-billing.grace_period_days': 7,
	'listing-billing.listing_price_cents': 9900,
	'listing-billing.featuring_price_cents': 4900,
	'listing-billing.dunning_offset_days': [1, 3, 6],
	'provider-availability.expiry_minutes': 240,
	'provider-availability.reminder_lead_minutes': 15,
	'provider-availability.active_week_window_days': 7,
	'provider-reviews.highly_rated_min_average': 4.5,
	'provider-reviews.highly_rated_min_reviews': 3,
	'direct-messaging.response_time_window_days': 30,
	'user-notifications.batch_window_minutes': 5,
	'user-notifications.email_unread_delay_minutes': 5,
	'platform-configuration.operating_timezone': 'Africa/Johannesburg',
	'platform-configuration.safety_info_html':
		'<p>Meet in a public, professional setting. Trust your instincts. Report anyone who makes you feel unsafe.</p>'
};

export const CONFIG_KEYS = Object.keys(ConfigRegistry) as ConfigKey[];

export function isConfigKey(key: string): key is ConfigKey {
	return key in ConfigRegistry;
}

export type CrossKeyIssue = { path: string; message: string };

export function validateCrossKeys(values: { [K in ConfigKey]: ConfigValue<K> }): CrossKeyIssue[] {
	const issues: CrossKeyIssue[] = [];
	if (
		values['provider-availability.reminder_lead_minutes'] >=
		values['provider-availability.expiry_minutes']
	) {
		issues.push({
			path: 'provider-availability.reminder_lead_minutes',
			message: 'Reminder lead must be shorter than availability expiry.'
		});
	}
	const grace = values['listing-billing.grace_period_days'];
	for (const offset of values['listing-billing.dunning_offset_days']) {
		if (offset >= grace) {
			issues.push({
				path: 'listing-billing.dunning_offset_days',
				message: 'Each dunning offset must be within the grace period.'
			});
			break;
		}
	}
	return issues;
}
