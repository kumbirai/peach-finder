export const ACTIVE_THIS_WEEK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type ActiveThisWeekSignals = {
	signedIn: boolean;
	availabilitySet: boolean;
	profileEdited: boolean;
	messageSent: boolean;
};

export function isActiveThisWeek(signals: ActiveThisWeekSignals): boolean {
	return (
		signals.signedIn || signals.availabilitySet || signals.profileEdited || signals.messageSent
	);
}

export function activeThisWeekWindowStart(now: Date): Date {
	return new Date(now.getTime() - ACTIVE_THIS_WEEK_WINDOW_MS);
}
