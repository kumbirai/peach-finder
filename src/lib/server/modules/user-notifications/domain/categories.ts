export type NotificationChannel = 'email' | 'push' | 'in_app';

export type CategoryDefinition = {
	id: string;
	label: string;
	description: string;
	essential: boolean;
	channels: readonly NotificationChannel[];
};

export const NOTIFICATION_CATEGORIES: readonly CategoryDefinition[] = [
	{
		id: 'new_message',
		label: 'New messages',
		description: 'When someone sends you a message on Peach Finder.',
		essential: false,
		channels: ['push', 'email', 'in_app']
	},
	{
		id: 'availability_expiry_warning',
		label: 'Availability expiry',
		description: 'When your "Available now" status is about to expire.',
		essential: false,
		channels: ['push', 'in_app']
	},
	{
		id: 'review_received',
		label: 'New reviews',
		description: 'When a seeker leaves a review on your profile.',
		essential: false,
		channels: ['email', 'in_app']
	},
	{
		id: 'report_resolution',
		label: 'Report updates',
		description: 'When a report you filed is reviewed or closed.',
		essential: false,
		channels: ['in_app']
	},
	{
		id: 'account_welcome',
		label: 'Welcome email',
		description: 'A one-time welcome note when you join Peach Finder.',
		essential: false,
		channels: ['email']
	},
	{
		id: 'identity_outcome',
		label: 'Identity verification',
		description: 'When your identity verification is approved or needs attention.',
		essential: true,
		channels: ['email', 'in_app']
	},
	{
		id: 'report_receipt',
		label: 'Report receipts',
		description: 'Confirmation when you submit a safety report.',
		essential: true,
		channels: ['in_app']
	},
	{
		id: 'moderation_outcome',
		label: 'Moderation decisions',
		description: 'When moderation action affects your account or content.',
		essential: true,
		channels: ['email', 'in_app']
	},
	{
		id: 'billing_payment',
		label: 'Payment receipts',
		description: 'When a payment succeeds or fails.',
		essential: true,
		channels: ['email', 'in_app']
	},
	{
		id: 'billing_grace',
		label: 'Billing grace period',
		description: 'When your listing enters a payment grace period.',
		essential: true,
		channels: ['email', 'in_app']
	},
	{
		id: 'billing_unpublished',
		label: 'Listing unpublished',
		description: 'When your listing is unpublished for non-payment.',
		essential: true,
		channels: ['email', 'in_app']
	},
	{
		id: 'billing_trial_ending',
		label: 'Trial ending soon',
		description: 'When your free trial period is about to end.',
		essential: true,
		channels: ['email', 'in_app']
	}
] as const;

export const ESSENTIAL_CATEGORY_IDS = new Set(
	NOTIFICATION_CATEGORIES.filter((category) => category.essential).map((category) => category.id)
);

export const OPT_OUT_CATEGORY_IDS = new Set(
	NOTIFICATION_CATEGORIES.filter((category) => !category.essential).map((category) => category.id)
);

export function isEssentialCategory(category: string): boolean {
	return ESSENTIAL_CATEGORY_IDS.has(category);
}

export function getCategoryDefinition(category: string): CategoryDefinition | undefined {
	return NOTIFICATION_CATEGORIES.find((entry) => entry.id === category);
}

export function isValidPreferenceChannel(channel: string): channel is NotificationChannel {
	return channel === 'email' || channel === 'push' || channel === 'in_app';
}
