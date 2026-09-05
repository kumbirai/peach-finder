<script lang="ts">
	import {
		RESPONSE_TIME_DISCLOSURE_TEST_ID,
		RESPONSE_TIME_DISCLOSURE_THREAD
	} from '$lib/messaging/response-time-disclosure';
</script>

<aside class="response-time-disclosure" role="note" data-testid={RESPONSE_TIME_DISCLOSURE_TEST_ID}>
	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
		<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" />
		<path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
	</svg>
	<p class="response-time-disclosure__text">{RESPONSE_TIME_DISCLOSURE_THREAD}</p>
</aside>

<style>
	.response-time-disclosure {
		display: flex;
		gap: var(--space-sm);
		align-items: flex-start;
		background: var(--color-blush);
		color: var(--color-pine);
		border-radius: var(--radius-md);
		padding: var(--space-md);
		margin-bottom: var(--space-md);
	}
	.response-time-disclosure svg {
		flex-shrink: 0;
		margin-top: 2px;
	}
	.response-time-disclosure__text {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.45;
	}
</style>
