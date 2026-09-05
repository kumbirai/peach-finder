export type ActiveThisWeekSignalKey =
	'signedIn' | 'availabilitySet' | 'profileEdited' | 'messageSent';

export type ActiveThisWeekSignalsUi = {
	signedIn: boolean;
	availabilitySet: boolean;
	availabilitySetCount: number;
	profileEdited: boolean;
	messageSent: boolean;
};

export type ActiveThisWeekTransparencyUi = {
	qualifies: boolean;
	badgeActive: boolean;
	sinceIso: string;
	signals: ActiveThisWeekSignalsUi;
};

export const ACTIVE_THIS_WEEK_SIGNAL_LABELS: Record<ActiveThisWeekSignalKey, string> = {
	signedIn: 'Signed in to Peach Finder',
	availabilitySet: 'Set or renewed availability',
	profileEdited: 'Edited your profile',
	messageSent: 'Sent a message to a seeker'
};

export const ACTIVE_THIS_WEEK_SIGNAL_ORDER: ActiveThisWeekSignalKey[] = [
	'signedIn',
	'availabilitySet',
	'profileEdited',
	'messageSent'
];

export function formatActiveThisWeekHeadline(qualifies: boolean): string {
	return qualifies
		? 'Active this week, earned from your recent activity'
		: 'Active this week — complete any one of these in the last 7 days';
}

export function isSignalMet(
	key: ActiveThisWeekSignalKey,
	signals: ActiveThisWeekSignalsUi
): boolean {
	switch (key) {
		case 'signedIn':
			return signals.signedIn;
		case 'availabilitySet':
			return signals.availabilitySet;
		case 'profileEdited':
			return signals.profileEdited;
		case 'messageSent':
			return signals.messageSent;
	}
}

export function formatAvailabilitySetDetail(count: number): string {
	if (count === 1) return '1 set or renewal in the last 7 days';
	return `${count} sets or renewals in the last 7 days`;
}

export function formatExpiryCountdown(expiresInSeconds: number): string {
	const totalMinutes = Math.max(0, Math.ceil(expiresInSeconds / 60));
	if (totalMinutes < 60) {
		return totalMinutes === 1 ? 'Expires in 1 minute' : `Expires in ${totalMinutes} minutes`;
	}
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (minutes === 0) {
		return hours === 1 ? 'Expires in 1 hour' : `Expires in ${hours} hours`;
	}
	const hourPart = hours === 1 ? '1 hour' : `${hours} hours`;
	const minutePart = minutes === 1 ? '1 minute' : `${minutes} minutes`;
	return `Expires in ${hourPart} ${minutePart}`;
}
