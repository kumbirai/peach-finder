<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import ReviewComposeForm from '$lib/components/ReviewComposeForm.svelte';
	import type { OwnReviewDto } from '$lib/server/modules/provider-reviews';
	import { onMount } from 'svelte';

	let {
		data
	}: {
		data: {
			providerProfileId: string;
			displayName: string;
			profilePath: string;
			eligibility: { eligible: boolean; reason?: string };
			ownReview: OwnReviewDto | null;
		};
	} = $props();

	let busy = $state(false);
	let statusMessage = $state('');
	let statusRole = $state<'status' | 'alert'>('status');
	let submitted = $state(false);
	let clientReview = $state<OwnReviewDto | null>(null);
	let editing = $state(false);
	let editConfirming = $state(false);
	let deleteConfirming = $state(false);
	let deleted = $state(false);
	let syncedProfileId = $state(data.providerProfileId);
	let hydrated = $state(false);

	onMount(() => {
		hydrated = true;
	});

	$effect(() => {
		const profileId = data.providerProfileId;
		if (profileId === syncedProfileId) return;
		syncedProfileId = profileId;
		clientReview = null;
		editing = false;
		editConfirming = false;
		deleteConfirming = false;
		deleted = false;
		submitted = false;
		statusMessage = '';
	});

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

	async function updateReview(input: { rating: number; body?: string }) {
		if (!(clientReview ?? data.ownReview)) return;
		if (!editConfirming) {
			editConfirming = true;
			return;
		}

		busy = true;
		statusMessage = '';
		try {
			const response = await fetch(`/api/reviews/${(clientReview ?? data.ownReview)!.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({
					rating: input.rating,
					body: input.body ?? null
				})
			});
			const json = (await response.json()) as {
				data?: OwnReviewDto;
				error?: { message: string };
			};
			if (!response.ok) {
				statusRole = 'alert';
				statusMessage = json.error?.message ?? 'Could not update your review.';
				editConfirming = false;
				return;
			}
			clientReview = json.data ?? clientReview ?? data.ownReview;
			editing = false;
			editConfirming = false;
			statusRole = 'status';
			statusMessage = 'Your review was updated.';
		} catch {
			statusRole = 'alert';
			statusMessage = 'Could not update your review.';
			editConfirming = false;
		} finally {
			busy = false;
		}
	}

	async function removeReview() {
		if (!(clientReview ?? data.ownReview)) return;
		if (!deleteConfirming) {
			deleteConfirming = true;
			return;
		}

		busy = true;
		statusMessage = '';
		try {
			const response = await fetch(`/api/reviews/${(clientReview ?? data.ownReview)!.id}`, {
				method: 'DELETE',
				credentials: 'same-origin'
			});
			const json = (await response.json()) as { error?: { message: string } };
			if (!response.ok) {
				statusRole = 'alert';
				statusMessage = json.error?.message ?? 'Could not delete your review.';
				deleteConfirming = false;
				return;
			}
			clientReview = null;
			deleted = true;
			deleteConfirming = false;
		} catch {
			statusRole = 'alert';
			statusMessage = 'Could not delete your review.';
			deleteConfirming = false;
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
		<h1 class="display">{(clientReview ?? data.ownReview) ? 'Your review' : 'Write a review'}</h1>
		<p class="intro">{data.displayName}</p>
	</header>

	<section class="panel" data-testid="review-panel" data-review-hydrated={hydrated}>
		{#if deleted}
			<p class="success" role="status" data-testid="review-deleted">
				Your review was removed from {data.displayName}'s profile.
			</p>
			<Button href={data.profilePath} variant="secondary">Back to profile</Button>
		{:else if submitted}
			<p class="success" role="status" data-testid="review-success">
				Thanks — your review is live on {data.displayName}'s profile.
			</p>
			<Button href={data.profilePath} variant="secondary">Back to profile</Button>
		{:else if (clientReview ?? data.ownReview) && editing}
			{@const review = clientReview ?? data.ownReview}
			<p class="hint">Changes publish immediately on {data.displayName}'s profile.</p>
			<ReviewComposeForm
				{busy}
				initialRating={review!.rating}
				initialBody={review!.body ?? ''}
				submitLabel={editConfirming ? 'Confirm update' : 'Update review'}
				busyLabel="Updating…"
				onSubmit={updateReview}
			/>
			<Button
				variant="secondary"
				disabled={busy}
				onclick={() => {
					editing = false;
					editConfirming = false;
					statusMessage = '';
				}}
			>
				Cancel
			</Button>
		{:else if clientReview ?? data.ownReview}
			{@const review = clientReview ?? data.ownReview}
			<p class="hint" role="status" data-testid="review-manage-copy">
				Your review is live on this profile.
				{#if review!.isEdited}
					<span class="edited-marker" data-testid="review-own-edited">edited</span>
				{/if}
			</p>
			<div class="own-review" data-testid="review-own-summary">
				<p class="own-rating" aria-label="{review!.rating} out of 5 stars">
					{'★'.repeat(review!.rating)}{'☆'.repeat(5 - review!.rating)}
				</p>
				{#if review!.body}
					<p class="own-body">{review!.body}</p>
				{/if}
			</div>
			{#if deleteConfirming}
				<p class="confirm-copy" role="status" data-testid="review-delete-confirm">
					This removes your review from {data.displayName}'s profile. This cannot be undone.
				</p>
			{/if}
			<div class="actions">
				<span data-testid="review-edit-button">
					<Button
						variant="secondary"
						disabled={busy}
						onclick={() => {
							editing = true;
							deleteConfirming = false;
							statusMessage = '';
						}}
					>
						Edit review
					</Button>
				</span>
				<span data-testid="review-delete-button">
					<Button variant="ghost" disabled={busy} onclick={() => void removeReview()}>
						{deleteConfirming ? 'Confirm delete' : 'Delete review'}
					</Button>
				</span>
			</div>
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
	.success,
	.confirm-copy {
		margin: 0;
		color: var(--color-stone);
		font-size: 0.9375rem;
	}
	.success {
		color: var(--color-pine);
	}
	.edited-marker {
		font-style: italic;
		margin-left: var(--space-xs);
	}
	.own-review {
		display: grid;
		gap: var(--space-sm);
	}
	.own-rating {
		margin: 0;
		color: var(--color-peach-deep);
		font-size: 1.125rem;
	}
	.own-body {
		margin: 0;
		color: var(--color-ink);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
	}
	.status {
		margin: var(--space-sm) 0 0;
		color: var(--color-stone);
	}
</style>
