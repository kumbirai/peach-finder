<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import Navigation from '$lib/components/Navigation.svelte';

	let {
		data
	}: {
		data: {
			profile: { displayName: string } | null;
			inbox: Array<{
				threadId: string;
				counterpartName: string;
				lastMessagePreview: string;
			}>;
			analytics: {
				profileViews: number;
				searchAppearances: number;
				contactRequests: number;
				reviewsReceived: number;
			} | null;
		};
	} = $props();
</script>

<svelte:head>
	<title>Provider dashboard — Peach Finder</title>
</svelte:head>

<Navigation current="provider" />

<main class="page">
	<h1 class="headline">Your dashboard</h1>
	<p class="body intro">
		Provider messages and analytics stay here — separate from your seeker conversations.
	</p>

	{#if data.profile && data.analytics}
		<section class="section" aria-labelledby="inbox-heading">
			<h2 id="inbox-heading" class="title">Messages from seekers</h2>
			{#if data.inbox.length === 0}
				<Card>
					<p class="body">No seeker messages yet.</p>
				</Card>
			{:else}
				<ul class="inbox-list">
					{#each data.inbox as thread (thread.threadId)}
						<li>
							<Card>
								<p class="label counterpart">{thread.counterpartName}</p>
								<p class="body preview">{thread.lastMessagePreview}</p>
							</Card>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="section" aria-labelledby="analytics-heading">
			<h2 id="analytics-heading" class="title">Your reach</h2>
			<p class="body hint">See how seekers find and contact you.</p>
			<div class="stat-row">
				<Card>
					<p class="stat-label label">Profile views</p>
					<p class="stat-value headline">{data.analytics.profileViews}</p>
				</Card>
				<Card>
					<p class="stat-label label">Search appearances</p>
					<p class="stat-value headline">{data.analytics.searchAppearances}</p>
				</Card>
				<Card>
					<p class="stat-label label">Contact requests</p>
					<p class="stat-value headline">{data.analytics.contactRequests}</p>
				</Card>
				<Card>
					<p class="stat-label label">Reviews received</p>
					<p class="stat-value headline">{data.analytics.reviewsReceived}</p>
				</Card>
			</div>
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
	.intro,
	.hint {
		margin: 0;
		color: var(--color-stone);
	}
	.section {
		display: grid;
		gap: var(--space-md);
	}
	.inbox-list {
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
	.stat-row {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-md);
	}
	.stat-label {
		margin: 0 0 var(--space-xs);
		color: var(--color-stone);
	}
	.stat-value {
		margin: 0;
		color: var(--color-peach-deep);
	}
	@media (min-width: 768px) {
		.stat-row {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
</style>
