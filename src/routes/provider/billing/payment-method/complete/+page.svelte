<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import Navigation from '$lib/components/Navigation.svelte';

	let { data }: { data: { error?: string } } = $props();
</script>

<svelte:head>
	<title>Complete payment method — Peach Finder</title>
</svelte:head>

<Navigation current="provider" />

<main class="page" data-testid="billing-payment-complete-page">
	<h1 class="headline">Secure card capture</h1>
	<Card>
		{#if data.error}
			<p class="body error" role="alert">{data.error}</p>
			<Button variant="primary" href="/provider/billing">Back to billing</Button>
		{:else}
			<p class="body">Completing your payment method…</p>
		{/if}
	</Card>
</main>

<style>
	.page {
		max-width: 28rem;
		margin: 0 auto;
		padding: var(--space-xl) var(--space-md);
		display: grid;
		gap: var(--space-lg);
	}

	.error {
		color: var(--color-peach-deep);
	}
</style>
