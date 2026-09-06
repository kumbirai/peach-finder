<script lang="ts">
	import { enhance } from '$app/forms';
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import AvailabilityToggle from '$lib/components/provider/AvailabilityToggle.svelte';
	import AvailabilityRenewalBanner from '$lib/components/provider/AvailabilityRenewalBanner.svelte';
	import ListingBillingStatus from '$lib/components/provider/ListingBillingStatus.svelte';
	import TrialEndingBanner from '$lib/components/provider/TrialEndingBanner.svelte';
	import VerificationStatusBanner from '$lib/components/provider/VerificationStatusBanner.svelte';
	import ThreadListItem from '$lib/components/ThreadListItem.svelte';
	import type { VerificationOwnerStatus } from '$lib/server/modules/trust-and-safety/domain/verification-status';

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
				lastActivityAt: string;
				unreadCount: number;
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
			activeThisWeek: {
				qualifies: boolean;
				badgeActive: boolean;
				sinceIso: string;
				signals: {
					signedIn: boolean;
					availabilitySet: boolean;
					availabilitySetCount: number;
					profileEdited: boolean;
					messageSent: boolean;
				};
			} | null;
			renewalNotification: {
				id: string;
				title: string;
				body: string;
			} | null;
			verification: {
				status: VerificationOwnerStatus;
				rejectionReason: string | null;
			} | null;
			billing: {
				headline: string;
				trialEndsAt: string;
				endDateLabel: string | null;
				whatHappensNext: string;
			} | null;
			trialEndingNotification: {
				id: string;
				title: string;
				body: string;
			} | null;
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
		{#if data.trialEndingNotification}
			<TrialEndingBanner notification={data.trialEndingNotification} />
		{/if}

		{#if data.billing}
			<ListingBillingStatus billing={data.billing} />
		{/if}

		{#if data.publishState === 'published'}
			<section class="section" aria-labelledby="availability-heading">
				<h2 id="availability-heading" class="visually-hidden">Your availability</h2>
				{#if data.renewalNotification}
					<AvailabilityRenewalBanner notification={data.renewalNotification} />
				{/if}
				<AvailabilityToggle
					availability={data.availability}
					activeThisWeek={data.activeThisWeek}
					variant="hero"
				/>
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

		{#if data.verification}
			<section
				class="section"
				aria-labelledby="verify-heading"
				data-testid="dashboard-verification"
			>
				<h2 id="verify-heading" class="title">Get identity verified</h2>
				<Card>
					<div class="verify-row">
						<div>
							<p class="body verify-copy">
								Submit a government-ID photo and a selfie. An admin reviews it, usually within 2–3
								business days. Your profile stays live the whole time either way.
							</p>
							{#if data.verification.status !== 'never_submitted'}
								<VerificationStatusBanner
									status={data.verification.status}
									rejectionReason={data.verification.rejectionReason}
								/>
							{/if}
						</div>
						{#if data.verification.status === 'never_submitted' || data.verification.status === 'rejected'}
							<div data-testid="get-verified-cta">
								<Button variant="secondary" href="/provider/verify">
									{data.verification.status === 'rejected' ? 'Resubmit' : 'Get verified'}
								</Button>
							</div>
						{:else if data.verification.status === 'pending'}
							<Button variant="secondary" href="/provider/verify">View status</Button>
						{/if}
					</div>
				</Card>
			</section>
		{/if}

		<section class="section" aria-labelledby="inbox-heading">
			<h2 id="inbox-heading" class="title">Messages from seekers</h2>
			{#if data.inbox.length === 0}
				<Card>
					<p class="body">No seeker messages yet.</p>
				</Card>
			{:else}
				<ul class="inbox-list">
					{#each data.inbox as thread (thread.threadId)}
						<ThreadListItem
							threadId={thread.threadId}
							counterpartName={thread.counterpartName}
							lastMessagePreview={thread.lastMessagePreview}
							lastActivityAt={thread.lastActivityAt}
							unreadCount={thread.unreadCount}
						/>
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
	.verify-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-md);
		align-items: flex-start;
		justify-content: space-between;
	}
	.verify-copy {
		margin: 0 0 var(--space-md);
		color: var(--color-stone);
		max-width: 52ch;
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
	@media (max-width: 480px) {
		.verify-row {
			flex-direction: column;
		}
		.verify-row :global(.btn) {
			width: 100%;
		}
	}
</style>
