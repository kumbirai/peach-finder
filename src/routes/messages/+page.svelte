<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import Button from '$lib/components/Button.svelte';

	let {
		data
	}: {
		data: {
			signedIn: boolean;
			threads: Array<{
				threadId: string;
				counterpartName: string;
				lastMessagePreview: string;
				lastActivityAt: string;
			}>;
			reviews: Array<{
				id: string;
				providerName: string;
				rating: number;
				body: string;
			}>;
		};
	} = $props();
</script>

<svelte:head>
	<title>Messages — Peach Finder</title>
</svelte:head>

<Navigation current="messages" />

<main class="page">
	<h1 class="headline">Messages</h1>
	<p class="body intro">
		Your seeker conversations and reviews stay here — separate from your provider dashboard.
	</p>

	{#if !data.signedIn}
		<Card>
			<p class="body">Sign in to message a therapist and see your conversations.</p>
			<Button href="/sign-in?returnTo=/messages" variant="primary">Sign in</Button>
		</Card>
	{:else}
		<section class="section" aria-labelledby="threads-heading">
			<h2 id="threads-heading" class="title">Conversations</h2>
			{#if data.threads.length === 0}
				<Card>
					<p class="body">No conversations yet. Browse therapists and send a message.</p>
					<Button href="/" variant="secondary">Browse therapists</Button>
				</Card>
			{:else}
				<ul class="thread-list">
					{#each data.threads as thread (thread.threadId)}
						<li>
							<a class="thread-link" href="/messages/{thread.threadId}">
								<Card>
									<p class="label counterpart">{thread.counterpartName}</p>
									<p class="body preview">{thread.lastMessagePreview}</p>
								</Card>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="section" aria-labelledby="reviews-heading">
			<h2 id="reviews-heading" class="title">Reviews you wrote</h2>
			{#if data.reviews.length === 0}
				<Card>
					<p class="body">You have not written any reviews yet.</p>
				</Card>
			{:else}
				<ul class="review-list">
					{#each data.reviews as review (review.id)}
						<li>
							<Card>
								<p class="label">{review.providerName} · {review.rating} stars</p>
								<p class="body">{review.body}</p>
							</Card>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</main>

<style>
	.page {
		max-width: 40rem;
		margin: 0 auto;
		padding: var(--space-xl) var(--space-md);
		display: grid;
		gap: var(--space-xl);
	}
	.intro {
		margin: 0;
		color: var(--color-stone);
	}
	.section {
		display: grid;
		gap: var(--space-md);
	}
	.thread-list,
	.review-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-md);
	}
	.counterpart {
		margin: 0 0 var(--space-xs);
		color: var(--color-ink);
		font-weight: 600;
	}
	.preview {
		margin: 0;
		color: var(--color-stone);
	}
	.thread-link {
		display: block;
		color: inherit;
		text-decoration: none;
		border-radius: var(--radius-card);
	}
	.thread-link:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
	}
</style>
