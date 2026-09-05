<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import { messageButtonLabel } from '$lib/contact-actions';

	let {
		messageHref,
		messageDraftKey,
		callHref,
		displayName,
		showMessage = true
	}: {
		messageHref: string;
		messageDraftKey?: string;
		callHref?: string | undefined;
		displayName: string;
		showMessage?: boolean;
	} = $props();

	const messageLabel = $derived(messageButtonLabel(displayName));
</script>

<div class="sticky-cta" role="group" aria-label="Contact actions" data-testid="profile-sticky-cta">
	{#if callHref}
		<Button href={callHref} variant="secondary">Call</Button>
	{/if}
	{#if showMessage}
		<Button href={messageHref} variant="primary" {messageDraftKey}>{messageLabel}</Button>
	{/if}
</div>

<style>
	.sticky-cta {
		position: sticky;
		bottom: 0;
		display: flex;
		gap: var(--space-sm);
		padding: var(--space-md) var(--space-lg);
		background: var(--color-paper);
		box-shadow: var(--shadow-sheet);
		z-index: 12;
	}
	.sticky-cta :global(.btn) {
		flex: 1;
	}
	@media (max-width: 767px) {
		.sticky-cta {
			bottom: calc(58px + env(safe-area-inset-bottom, 0px));
		}
	}
	@media (min-width: 768px) {
		.sticky-cta {
			bottom: 0;
		}
	}
</style>
