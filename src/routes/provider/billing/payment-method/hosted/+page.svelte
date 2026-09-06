<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';

	let { data }: { data: { reference: string; callback: string } } = $props();

	let completing = $state(false);
	let error = $state<string | null>(null);

	async function completeHostedCapture() {
		error = null;
		completing = true;
		try {
			const res = await fetch('/api/dev/billing-complete-fake-auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ reference: data.reference })
			});
			if (!res.ok) {
				error = 'Could not complete secure card capture.';
				return;
			}
			window.location.href = data.callback;
		} catch {
			error = 'Could not complete secure card capture.';
		} finally {
			completing = false;
		}
	}
</script>

<svelte:head>
	<title>Secure card capture — Peach Finder payment partner</title>
</svelte:head>

<main class="hosted-page" data-testid="billing-hosted-payment-page">
	<Card>
		<h1 class="headline">Secure card capture</h1>
		<p class="body">
			This page simulates our payment partner&apos;s hosted checkout. Card details are entered here,
			not on Peach Finder — SAQ-A compliant.
		</p>
		<p class="label partner-note">
			Payment partner checkout · Reference {data.reference.slice(-8)}
		</p>
		{#if error}
			<p class="error label" role="alert">{error}</p>
		{/if}
		<Button variant="primary" disabled={completing} onclick={completeHostedCapture}>
			{completing ? 'Saving card…' : 'Save card securely'}
		</Button>
	</Card>
</main>

<style>
	.hosted-page {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: var(--space-xl) var(--space-md);
		background: color-mix(in srgb, var(--color-ink) 4%, var(--color-paper));
	}

	.partner-note {
		margin: var(--space-md) 0;
		color: var(--color-stone);
	}

	.error {
		color: var(--color-peach-deep);
	}
</style>
