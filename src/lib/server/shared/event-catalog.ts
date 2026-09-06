/** Event names from event-catalog.md §2. New names are registered there first. */
export const DOMAIN_EVENT_NAMES = [
	'UserRegistered',
	'EmailVerified',
	'PhoneVerified',
	'AccountDeletionRequested',
	'ProviderPublished',
	'ProviderUnpublished',
	'ProfileUpdated',
	'PhotoAdded',
	'PhotoRemoved',
	'AvailabilitySet',
	'AvailabilityCleared',
	'AvailabilityExpired',
	'AvailabilityExpiryWarned',
	'ThreadCreated',
	'MessageSent',
	'ReviewSubmitted',
	'ReviewReplied',
	'RatingAggregateChanged',
	'VerificationDecided',
	'BadgeGranted',
	'BadgeRevoked',
	'ReportFiled',
	'ReportResolved',
	'ModerationActionTaken',
	'UserBlocked',
	'TrialStarted',
	'SubscriptionActivated',
	'FeaturingActivated',
	'FeaturingLapsed',
	'PaymentSucceeded',
	'PaymentFailed',
	'GraceEntered',
	'ListingLapsed',
	'MediaProcessed',
	'MediaRemoved',
	'ConfigChanged',
	'IdentityAttributesChanged',
	'UserUnblocked',
	'NotificationDispatched'
] as const;

export type DomainEventName = (typeof DOMAIN_EVENT_NAMES)[number];

export const EVENT_SUBSCRIBERS: Record<DomainEventName, readonly string[]> = {
	UserRegistered: ['user-notifications.welcome'],
	EmailVerified: ['direct-messaging.release-held'],
	PhoneVerified: ['listing-billing.trial-eligibility'],
	AccountDeletionRequested: [
		'provider-profile.unpublish-on-delete',
		'listing-billing.cancel-on-delete',
		'direct-messaging.mark-deleted-account'
	],
	ProviderPublished: ['discovery-search.projection-upsert', 'listing-billing.start-trial'],
	ProviderUnpublished: ['discovery-search.projection-remove'],
	ProfileUpdated: ['discovery-search.projection-refresh'],
	PhotoAdded: ['discovery-search.projection-refresh'],
	PhotoRemoved: ['discovery-search.projection-refresh'],
	AvailabilitySet: ['discovery-search.projection-upsert'],
	AvailabilityCleared: ['discovery-search.projection-upsert'],
	AvailabilityExpired: ['discovery-search.projection-upsert'],
	AvailabilityExpiryWarned: ['user-notifications.renewal-prompt'],
	ThreadCreated: ['provider-analytics.contact-request'],
	MessageSent: ['user-notifications.new-message', 'direct-messaging.response-time'],
	ReviewSubmitted: ['discovery-search.rating-refresh', 'user-notifications.review-submitted'],
	ReviewReplied: [],
	RatingAggregateChanged: ['discovery-search.projection-field'],
	VerificationDecided: ['user-notifications.verification-outcome', 'discovery-search.badge-flag'],
	BadgeGranted: ['discovery-search.badge-flag'],
	BadgeRevoked: ['discovery-search.badge-flag'],
	ReportFiled: ['user-notifications.report-receipt'],
	ReportResolved: ['user-notifications.report-resolved'],
	ModerationActionTaken: [
		'provider-profile.moderation-effect',
		'provider-reviews.moderation-effect',
		'media-processing.moderation-effect',
		'user-notifications.moderation-notice',
		'discovery-search.projection-remove'
	],
	UserBlocked: [
		'direct-messaging.block-cache',
		'discovery-search.exclude-blocker',
		'user-notifications.block-silence'
	],
	TrialStarted: [],
	SubscriptionActivated: [],
	FeaturingActivated: ['discovery-search.featuring'],
	FeaturingLapsed: ['discovery-search.featuring'],
	PaymentSucceeded: ['user-notifications.billing', 'provider-profile.republish-after-lapse'],
	PaymentFailed: ['user-notifications.billing'],
	GraceEntered: ['user-notifications.dunning'],
	ListingLapsed: [
		'provider-profile.auto-unpublish',
		'discovery-search.projection-remove',
		'user-notifications.lapsed-notice'
	],
	MediaProcessed: ['provider-profile.attach-photo', 'discovery-search.projection-refresh'],
	MediaRemoved: ['provider-profile.detach-photo', 'discovery-search.projection-refresh'],
	ConfigChanged: ['platform-configuration.config-cache'],
	IdentityAttributesChanged: ['trust-and-safety.badge-suppress', 'discovery-search.name-refresh'],
	UserUnblocked: [
		'direct-messaging.unblock-cache',
		'discovery-search.include-blocker',
		'user-notifications.unblock-cache'
	],
	NotificationDispatched: []
};

export const ERROR_CODES = {
	NOT_FOUND: 'NOT_FOUND',
	FORBIDDEN: 'FORBIDDEN',
	VALIDATION_FAILED: 'VALIDATION_FAILED',
	RATE_LIMITED: 'RATE_LIMITED',
	UNAUTHENTICATED: 'UNAUTHENTICATED',
	UNAVAILABLE: 'UNAVAILABLE',
	CONFLICT: 'CONFLICT',
	VERIFICATION_ALREADY_PENDING: 'VERIFICATION_ALREADY_PENDING',
	PRECONDITION_FAILED: 'PRECONDITION_FAILED',
	PAYMENT_METHOD_REQUIRED: 'PAYMENT_METHOD_REQUIRED',
	PSP_UNAVAILABLE: 'PSP_UNAVAILABLE',
	CONFIG_KEY_UNKNOWN: 'CONFIG_KEY_UNKNOWN',
	INTERNAL: 'INTERNAL',
	BLOCKED: 'BLOCKED',
	THREAD_NOT_FOUND: 'THREAD_NOT_FOUND',
	REVIEW_INELIGIBLE: 'REVIEW_INELIGIBLE',
	REVIEW_ALREADY_EXISTS: 'REVIEW_ALREADY_EXISTS'
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
