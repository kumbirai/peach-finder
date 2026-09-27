/** Block mirrors must land before other subscribers read `block_cache`. */
export function outboxClaimPriority(eventName: string): number {
	return eventName === 'UserBlocked' || eventName === 'UserUnblocked' ? 0 : 1;
}
