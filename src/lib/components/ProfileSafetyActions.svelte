<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import ProfileShareButton from '$lib/components/ProfileShareButton.svelte';

	let {
		shareUrl,
		shareTitle,
		reviewHref,
		reportHref,
		blockHref
	}: {
		shareUrl: string;
		shareTitle: string;
		reviewHref: string;
		reportHref: string;
		blockHref: string;
	} = $props();
</script>

<div class="profile-actions" role="group" aria-label="Profile actions">
	<span data-testid="profile-share-button" data-share-url={shareUrl}>
		<ProfileShareButton url={shareUrl} title={shareTitle} />
	</span>
	<Button href={reviewHref} variant="secondary">Review</Button>
	<Button href={reportHref} variant="ghost">Report</Button>
	<Button href={blockHref} variant="ghost">Block</Button>
</div>

<style>
	.profile-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
		padding: 0 var(--space-lg) var(--space-md);
	}
	.profile-actions :global(.btn) {
		font-size: 0.875rem;
		padding: 10px 18px;
		min-height: 44px;
	}
</style>
