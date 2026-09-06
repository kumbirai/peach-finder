<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import ReviewComposeForm from '$lib/components/ReviewComposeForm.svelte';

	let {
		data
	}: {
		data: {
			providerProfileId: string;
			displayName: string;
			profilePath: string;
			eligibility: { eligible: boolean; reason?: string };
		};
	} = $props();

	let busy = $state(false);
	let statusMessage = $state('');
	let statusRole = $state<'status' | 'alert'>('status');
	let submitted = $state(false);

	async function submitReview(input: { rating: number; body?: string }) {
		busy = true;
		statusMessage = '';
		try {
			const response = await fetch('/api/reviews', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({
					providerProfileId: data.providerProfileId,
					rating: input.rating,
					body: input.body
				})
			});
			const json = (await response.json()) as { error?: { message: string } };
			if (!response.ok) {
				statusRole = 'alert';
				statusMessage = json.error?.message ?? 'Could not publish your review.';
				return;
			}
			submitted = true;
		} catch {
			statusRole = 'alert';
			statusMessage = 'Could not publish your review.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Review {data.displayName} — Peach Finder</title>
</svelte:head>

<Navigation current="search" />

<main class="page">
	<header class="page-header">
		<h1 class="display">Write a review</h1>
		<p class="intro">{data.displayName}</p>
	</header>

	<section class="panel" data-testid="review-panel">
		{#if submitted}
			<p class="success" role="status" data-testid="review-success">
				Thanks — your review is live on {data.displayName}'s profile.
			</p>
			<Button href={data.profilePath} variant="secondary">Back to profile</Button>
		{:else if !data.eligibility.eligible}
			<p class="ineligible" role="status" data-testid="review-ineligible-reason">
				{data.eligibility.reason ?? "You can review after you've been in contact for a day."}
			</p>
			<Button href={data.profilePath} variant="secondary">Back to profile</Button>
		{:else}
			<p class="hint">
				Your rating and comments publish immediately and help the next person decide.
			</p>
			<ReviewComposeForm {busy} onSubmit={submitReview} />
		{/if}
	</section>

	{#if statusMessage}
		<p class="status label" role={statusRole}>{statusMessage}</p>
	{/if}
</main>

<style>
	.page {
		max-width: 40rem;
		margin: 0 auto;
		padding: var(--space-lg) var(--space-lg) 5rem;
	}
	.page-header {
		display: grid;
		gap: var(--space-xs);
		margin-bottom: var(--space-lg);
	}
	.intro {
		color: var(--color-stone);
		margin: 0;
	}
	.panel {
		display: grid;
		gap: var(--space-md);
		padding: var(--space-lg);
		background: var(--color-blush);
		border-radius: var(--radius-md);
	}
	.hint,
	.ineligible,
	.success {
		margin: 0;
		color: var(--color-stone);
		font-size: 0.9375rem;
	}
	.success {
		color: var(--color-pine);
	}
	.status {
		margin: var(--space-sm) 0 0;
		color: var(--color-stone);
	}
</style>
