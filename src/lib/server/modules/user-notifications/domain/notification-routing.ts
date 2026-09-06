export type VerificationDecision = 'approved' | 'rejected' | string;

export function threadDeepLinkPath(threadId: string): string {
	return `/messages/${threadId}`;
}

export function billingDeepLinkPath(): string {
	return '/provider/billing';
}

export function verificationDeepLinkPath(decision: VerificationDecision): string {
	return decision === 'rejected' ? '/provider/verify' : '/provider/dashboard';
}

export function reviewDeepLinkPath(): string {
	return '/provider/reviews';
}

export function availabilityRenewalDeepLinkPath(): string {
	return '/provider/dashboard?renewAvailability=1';
}

export function profileDeepLinkPath(): string {
	return '/profile';
}

export function providerDashboardDeepLinkPath(): string {
	return '/provider/dashboard';
}

export function welcomeDeepLinkPath(registrationIntent: string): string {
	return registrationIntent === 'provider' ? '/provider/onboarding' : '/';
}

export function moderationDeepLinkPath(action: string): string {
	if (action === 'suspend' || action === 'reinstate') {
		return profileDeepLinkPath();
	}
	return providerDashboardDeepLinkPath();
}

export function notificationOpenPath(notificationId: string): string {
	return `/api/notifications/in-app/${notificationId}/open`;
}

export function actionLabelForCategory(
	category: string,
	context?: { verificationDecision?: VerificationDecision }
): string {
	switch (category) {
		case 'new_message':
			return 'Open thread';
		case 'billing_payment':
		case 'billing_grace':
		case 'billing_unpublished':
		case 'billing_trial_ending':
			return 'Manage billing';
		case 'identity_outcome':
			return context?.verificationDecision === 'rejected'
				? 'Resubmit verification'
				: 'View dashboard';
		case 'review_received':
			return 'Read review';
		case 'availability_expiry_warning':
			return 'Still available';
		case 'report_receipt':
		case 'report_resolution':
			return 'View profile';
		case 'moderation_outcome':
			return 'View account';
		case 'account_welcome':
			return 'Get started';
		default:
			return 'Open';
	}
}

export function newMessageCopy(senderName: string, messageCount = 1): { title: string; body: string } {
	if (messageCount <= 1) {
		return {
			title: `New message from ${senderName}`,
			body: 'Open the thread to read and reply.'
		};
	}
	return {
		title: `${messageCount} new messages from ${senderName}`,
		body: 'Open the thread to catch up.'
	};
}

export function verificationOutcomeCopy(decision: VerificationDecision): { title: string; body: string } {
	if (decision === 'approved') {
		return {
			title: 'Identity verified',
			body: 'Your verified badge is live on your profile.'
		};
	}
	return {
		title: 'Verification needs another look',
		body: 'Open the resubmission form to try again with clearer documents.'
	};
}

export function reviewReceivedCopy(rating: number): { title: string; body: string } {
	return {
		title: 'New review on your profile',
		body: `You received a ${rating}-star review. Read it on your reviews page.`
	};
}

export function billingPaymentCopy(succeeded: boolean): { title: string; body: string } {
	if (succeeded) {
		return {
			title: 'Payment received',
			body: 'Your listing payment went through. View the receipt on billing.'
		};
	}
	return {
		title: 'Payment failed',
		body: 'Update your payment method on billing to stay published.'
	};
}

export function billingGraceCopy(graceLabel: string, reminderDay?: number): { title: string; body: string } {
	if (reminderDay !== undefined) {
		return {
			title: 'Grace period reminder',
			body: `Day ${reminderDay} of your billing grace period — add payment by ${graceLabel} to keep your profile visible in search.`
		};
	}
	return {
		title: 'Grace period started',
		body: `Your listing is in a grace period until ${graceLabel}. Manage billing to avoid being unpublished.`
	};
}

export function billingUnpublishedCopy(): { title: string; body: string } {
	return {
		title: 'Listing unpublished',
		body: 'Your profile was unpublished after the grace period. Pay on billing to republish instantly.'
	};
}

export function billingTrialEndingCopy(endsLabel: string): { title: string; body: string } {
	return {
		title: 'Free trial ending soon',
		body: `Your free listing trial ends on ${endsLabel}. Add a payment method on billing to stay published.`
	};
}

export function availabilityExpiryCopy(expiryLabel: string): { title: string; body: string } {
	return {
		title: 'Your availability expires soon',
		body: `Your "Available now" status expires at ${expiryLabel}. Tap Still available to stay visible to seekers.`
	};
}

export function reportReceiptCopy(): { title: string; body: string } {
	return {
		title: 'Report received',
		body: 'Thanks — we received your report and will review it.'
	};
}

export function reportResolutionCopy(acted: boolean): { title: string; body: string } {
	if (acted) {
		return {
			title: 'Report reviewed',
			body: 'We reviewed your report and took action.'
		};
	}
	return {
		title: 'Report closed',
		body: 'We reviewed your report and closed it without further action.'
	};
}

export function moderationOutcomeCopy(
	action: string,
	reason?: string
): { title: string; body: string } {
	const reasonSuffix = reason ? ` Reason: ${reason}` : '';
	switch (action) {
		case 'suspend':
			return {
				title: 'Account suspended',
				body: `Your account has been suspended.${reasonSuffix}`
			};
		case 'unpublish':
			return {
				title: 'Profile unpublished',
				body: `Your profile was unpublished by our team.${reasonSuffix}`
			};
		case 'remove_photo':
			return {
				title: 'Photo removed',
				body: `A photo was removed from your profile.${reasonSuffix}`
			};
		case 'remove_review':
			return {
				title: 'Review removed',
				body: `A review on your profile was removed.${reasonSuffix}`
			};
		case 'reinstate':
			return {
				title: 'Account reinstated',
				body: 'Your account access has been restored.'
			};
		case 'revoke_badge':
			return {
				title: 'Identity badge removed',
				body: `Your identity verified badge was removed.${reasonSuffix}`
			};
		default:
			return {
				title: 'Moderation update',
				body: `A moderation action was taken on your account.${reasonSuffix}`
			};
	}
}
