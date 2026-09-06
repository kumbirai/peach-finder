<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import ProviderReplyForm from '$lib/components/ProviderReplyForm.svelte';
	import type { PublicReviewDto } from '$lib/server/modules/provider-reviews';
	import { onMount } from 'svelte';

	let {
		data
	}: {
		data: {
			profileId: string;
			reviews: PublicReviewDto[];
		};
	} = $props();

	// writable derived: mirrors server data, but optimistic reply updates below can override until the next load
	let reviews = $derived(data.reviews.map((review) => ({ ...review })));
	let busyReviewId = $state<string | null>(null);
	let statusMessage = $state('');
	let statusRole = $state<'status' | 'alert'>('status');
	let hydrated = $state(false);

	onMount(() => {
		hydrated = true;
	});

	async function publishReply(reviewId: string, body: string) {
		busyReviewId = reviewId;
		statusMessage = '';
		try {
			const response = await fetch(`/api/reviews/${reviewId}/reply`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({ body })
			});
			const json = (await response.json()) as {
				data?: { providerReply: { body: string } | null };
				error?: { message: string };
			};
			if (!response.ok) {
				statusRole = 'alert';
				statusMessage = json.error?.message ?? 'Could not publish your reply.';
				return;
			}
			statusRole = 'status';
			statusMessage = 'Your reply is live on your profile.';
			reviews = reviews.map((review) =>
				review.id === reviewId
					? { ...review, providerReply: json.data?.providerReply ?? { body } }
					: review
			);
		} catch {
			statusRole = 'alert';
			statusMessage = 'Could not publish your reply.';
		} finally {
			busyReviewId = null;
		}
	}
</script>

<svelte:head>
	<title>Reviews — Peach Finder</title>
</svelte:head>

<Navigation current="provider" />

<main class="page" data-testid="provider-reviews-page" data-reviews-hydrated={hydrated}>
	<header class="page-header">
		<h1 class="headline">Reviews on your profile</h1>
		<p class="body intro">
			Reply once beneath each review so seekers see your side of the story where it is told.
		</p>
	</header>

	{#if statusMessage}
		<p class="status label" role={statusRole}>{statusMessage}</p>
	{/if}

	{#if reviews.length === 0}
		<Card>
			<p class="body">No reviews yet — they will appear here when seekers leave feedback.</p>
		</Card>
	{:else}
		<ul class="review-list">
			{#each reviews as review (review.id)}
				<li class="review-item" data-testid="provider-review-item">
					<Card>
						<div class="review-meta">
							<span class="review-name">{review.reviewerName}</span>
							<span class="stars" aria-label="{review.rating} out of 5 stars">
								{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
							</span>
						</div>
						<p class="review-body">{review.body}</p>
						<p class="review-foot">
							<span class="review-date">{review.dateLabel}</span>
							{#if review.isEdited}
								<span class="review-edited">edited</span>
							{/if}
						</p>

						{#if review.providerReply}
							<div class="review-reply" data-testid="provider-review-reply">
								<p class="review-reply-label">Your reply</p>
								<p>{review.providerReply.body}</p>
							</div>
						{:else}
							<div class="reply-compose" data-testid="provider-reply-compose">
								<ProviderReplyForm
									busy={busyReviewId === review.id}
									onSubmit={(input) => publishReply(review.id, input.body)}
								/>
							</div>
						{/if}
					</Card>
				</li>
			{/each}
		</ul>
	{/if}

	<p class="actions body">
		<Button href={`/provider/${data.profileId}`} variant="secondary">View live profile</Button>
		<Button href="/provider/dashboard" variant="ghost">Back to dashboard</Button>
	</p>
</main>

<style>
	.page {
		max-width: 40rem;
		margin: 0 auto;
		padding: var(--space-xl) var(--space-md);
		display: grid;
		gap: var(--space-xl);
	}
	.page-header {
		display: grid;
		gap: var(--space-sm);
	}
	.intro {
		margin: 0;
		color: var(--color-stone);
	}
	.status {
		margin: 0;
		color: var(--color-pine);
	}
	.review-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-md);
	}
	.review-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-sm);
		margin-bottom: var(--space-sm);
	}
	.review-name {
		font-weight: 600;
	}
	.stars {
		color: var(--color-peach-deep);
		letter-spacing: 0.05em;
	}
	.review-body {
		margin: 0 0 var(--space-sm);
	}
	.review-foot {
		margin: 0 0 var(--space-md);
		display: flex;
		gap: var(--space-sm);
		color: var(--color-stone);
		font-size: 0.875rem;
	}
	.review-edited {
		color: var(--color-stone);
	}
	.review-reply {
		margin-top: var(--space-md);
		padding: var(--space-md);
		background: var(--color-blush);
		border-radius: var(--radius-md);
		border-left: 3px solid var(--color-pine);
	}
	.review-reply-label {
		margin: 0 0 var(--space-xs);
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-pine);
	}
	.review-reply p:last-child {
		margin: 0;
	}
	.reply-compose {
		margin-top: var(--space-md);
		padding-top: var(--space-md);
		border-top: 1px solid var(--color-blush);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
		margin: 0;
	}
</style>
