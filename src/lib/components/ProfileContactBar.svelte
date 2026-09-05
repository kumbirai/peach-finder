<script lang="ts">
	import Button from '$lib/components/Button.svelte';

	let {
		messageHref,
		messageDraftKey,
		callHref,
		reviewHref,
		reportHref,
		blockHref
	}: {
		messageHref: string;
		messageDraftKey?: string;
		callHref?: string | undefined;
		reviewHref: string;
		reportHref: string;
		blockHref: string;
	} = $props();
</script>

<div class="contact-bar" role="group" aria-label="Contact actions">
	<Button href={messageHref} variant="primary" {messageDraftKey}>Message</Button>
	{#if callHref}
		<Button href={callHref} variant="secondary">Call</Button>
	{/if}
	<Button href={reviewHref} variant="secondary">Review</Button>
	<Button href={reportHref} variant="ghost">Report</Button>
	<Button href={blockHref} variant="ghost">Block</Button>
</div>

<style>
	.contact-bar {
		position: sticky;
		bottom: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
		padding: var(--space-md);
		background: var(--color-paper);
		box-shadow: var(--shadow-sheet);
	}
</style>
