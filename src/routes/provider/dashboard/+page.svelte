<script lang="ts">
	import { enhance } from '$app/forms';
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import AvailabilityToggle from '$lib/components/provider/AvailabilityToggle.svelte';

	let {
		data,
		form
	}: {
		data: {
			profile: { displayName: string; profileId: string } | null;
			publishState: string | null;
			unpublishConfirm: boolean;
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
			availability: {
				state: 'not_available' | 'available' | 'expiry_warned';
				setAt: string | null;
				expiresAt: string | null;
				expiresInSeconds: number | null;
			};
		};
		form?: { message?: string; issues?: Array<{ path: string; message: string }> };
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
		{#if data.publishState === 'published'}
			<section class="section" aria-labelledby="availability-heading">
				<h2 id="availability-heading" class="visually-hidden">Your availability</h2>
				<AvailabilityToggle availability={data.availability} variant="hero" />
			</section>
		{/if}

		<section class="section" aria-labelledby="setup-heading">
			<h2 id="setup-heading" class="title">
				{#if data.publishState === 'published'}
					Your live profile
				{:else if data.publishState === 'unpublished'}
					Your profile is hidden
				{:else}
					Profile setup
				{/if}
			</h2>
			<Card>
				{#if data.publishState === 'published'}
					<p class="body">Changes you save go live immediately — no review step.</p>
					<div class="action-row">
						<Button variant="primary" href="/provider/profile/edit">Edit profile</Button>
						<Button variant="secondary" href="/provider/profile/preview">Preview as seeker</Button>
						{#if data.unpublishConfirm}
							<form method="POST" action="?/unpublish" use:enhance class="unpublish-form">
								<p class="body confirm-copy" role="status">
									Hiding your profile removes it from search immediately. All your photos, services,
									and reviews stay saved — you can republish any time with no re-approval.
								</p>
								<div class="action-row">
									<Button variant="secondary" href="/provider/dashboard">Cancel</Button>
									<Button variant="primary" type="submit">Yes, hide my profile</Button>
								</div>
							</form>
						{:else}
							<Button variant="secondary" href="/provider/dashboard?unpublishConfirm=1"
								>Hide profile</Button
							>
						{/if}
					</div>
				{:else if data.publishState === 'unpublished'}
					<p class="body">
						Your profile is hidden from seekers. Everything you built is still here — republish when
						you are ready, with no review step.
					</p>
					{#if form?.issues?.length}
						<p class="error label" role="alert">{form.issues[0]?.message}</p>
					{/if}
					{#if form?.message}
						<p class="error label" role="alert">{form.message}</p>
					{/if}
					<div class="action-row">
						<form method="POST" action="?/republish" use:enhance>
							<Button variant="primary" type="submit">Republish profile</Button>
						</form>
						<Button variant="secondary" href="/provider/profile/edit">Edit profile</Button>
						<Button variant="secondary" href="/provider/profile/preview">Preview as seeker</Button>
					</div>
				{:else}
					<p class="body">Finish your profile so seekers can find and contact you.</p>
					<Button variant="primary" href="/provider/onboarding">Continue setup</Button>
				{/if}
			</Card>
		</section>

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
	.action-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
		margin-top: var(--space-md);
		align-items: center;
	}
	.unpublish-form {
		display: grid;
		gap: var(--space-md);
		width: 100%;
		margin-top: var(--space-md);
	}
	.confirm-copy {
		margin: 0;
		color: var(--color-stone);
	}
	.error {
		margin: 0 0 var(--space-sm);
		color: var(--color-peach-deep);
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
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	@media (min-width: 768px) {
		.stat-row {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
</style>
