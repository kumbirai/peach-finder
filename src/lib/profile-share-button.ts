export const COPY_PROFILE_LINK_LABEL = 'Copy profile link';
export const LINK_COPIED_LABEL = 'Link copied';

export const PROFILE_SHARE_FEEDBACK_MS = 1800;
export const PROFILE_SHARE_FEEDBACK_REDUCED_MS = 1200;

/** Delay before resetting copy feedback; reduced-motion users still need readable confirmation. */
export function profileShareFeedbackDelayMs(prefersReducedMotion = false): number {
	return prefersReducedMotion ? PROFILE_SHARE_FEEDBACK_REDUCED_MS : PROFILE_SHARE_FEEDBACK_MS;
}

export function readPrefersReducedMotion(): boolean {
	if (typeof window === 'undefined') return false;
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
