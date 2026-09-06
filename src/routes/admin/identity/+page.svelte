<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import PublicProfileView from '$lib/components/PublicProfileView.svelte';
	import type { PublicProfile } from '$lib/types/profile';

	let { data, form } = $props();

	let rejectOpenFor = $state<string | null>(null);
	let rejectReason = $state('');
	let docsNoteFor = $state<string | null>(null);
	let docPreviewUrls = $state<Record<string, string>>({});
	let docLoading = $state<string | null>(null);
	let docError = $state<string | null>(null);

	async function openDocuments(caseId: string, photoIds: string[]) {
		docsNoteFor = docsNoteFor === caseId ? null : caseId;
		docError = null;
		if (!photoIds.length) {
			docError = 'No documents attached to this case.';
			return;
		}

		docLoading = caseId;
		try {
			const next: Record<string, string> = { ...docPreviewUrls };
			for (const photoId of photoIds) {
				if (next[photoId]) continue;
				const res = await fetch(`/admin/api/media/identity-doc-url/${photoId}`);
				if (!res.ok) throw new Error('Could not open documents.');
				const body = (await res.json()) as { data: { url: string } };
				next[photoId] = body.data.url;
			}
			docPreviewUrls = next;
		} catch {
			docError = 'Could not open documents. Try again in a moment.';
		} finally {
			docLoading = null;
		}
	}

	function statsLabel(hours: number | null): string {
		if (hours === null) return 'no pending cases';
		if (hours < 24) return `avg age ${Math.round(hours)} hours`;
		const days = Math.round(hours / 24);
		return `avg age ${days} day${days === 1 ? '' : 's'}`;
	}
</script>

<main class="admin-panel admin-panel--top" data-testid="admin-identity-queue">
	<h1 class="headline">Identity review queue</h1>

	<div class="kpi-row" aria-label="Queue summary">
		<div class="kpi-tile">
			<div class="kpi-label">Identity queue</div>
			<div class="kpi-value">{data.stats.pendingCount}</div>
			<div class="kpi-sub">pending · {statsLabel(data.stats.avgAgeHours)}</div>
		</div>
	</div>

	{#if form?.message}
		<p class="form-message" role="alert">{form.message}</p>
	{/if}
	{#if docError}
		<p class="form-message" role="alert">{docError}</p>
	{/if}

	<div class="queue-list">
		{#if data.queue.length === 0}
			<p class="body admin-empty">Identity queue is empty. Nothing pending review.</p>
		{:else}
			{#each data.queue as item (item.caseId)}
				<article class="queue-row" data-testid="identity-queue-case" data-case-id={item.caseId}>
					<div class="queue-row__top">
						<div>
							<div class="queue-row__who">{item.displayName}</div>
							<div class="queue-row__meta">ID photo + selfie submitted</div>
						</div>
						<span class="queue-row__age" class:overdue={item.overdue} data-testid="queue-age">
							{item.queueAgeLabel}
						</span>
					</div>

					<div class="queue-row__body">
						<Button
							type="button"
							variant="ghost"
							onclick={() => openDocuments(item.caseId, item.docPhotoIds)}
							ariaLabel={`View submitted documents for ${item.displayName}`}
						>
							{docLoading === item.caseId ? 'Opening…' : 'View submitted documents'}
						</Button>
						{#if docsNoteFor === item.caseId}
							<p class="verify-copy admin-inline-note">
								Opens via a short-lived, admin-session-only link (≤ 5 min TTL, issuance
								audit-logged).
							</p>
							{#if item.docPhotoIds.length > 0}
								<div class="doc-grid" data-testid="identity-doc-preview">
									{#each item.docPhotoIds as photoId, index (photoId)}
										{#if docPreviewUrls[photoId]}
											<figure class="doc-frame">
												<img
													src={docPreviewUrls[photoId]}
													alt={index === 0 ? 'Government ID' : 'Selfie'}
												/>
												<figcaption>{index === 0 ? 'ID photo' : 'Selfie'}</figcaption>
											</figure>
										{/if}
									{/each}
								</div>
							{/if}
						{/if}
					</div>

					<div class="profile-context" data-testid="identity-queue-profile">
						<h2 class="profile-context__title">Live profile</h2>
						<PublicProfileView profile={item.profile as PublicProfile} previewMode={true} />
					</div>

					{#if rejectOpenFor === item.caseId}
						<form
							class="reject-reason admin-inline-field"
							method="POST"
							action="?/reject"
							use:enhance={() => {
								return async ({ update }) => {
									await update();
									rejectOpenFor = null;
									rejectReason = '';
								};
							}}
						>
							<input type="hidden" name="caseId" value={item.caseId} />
							<Input
								id={`reject-${item.caseId}`}
								name="reason"
								label="Rejection reason"
								placeholder="Reason (required, shown to the provider)"
								bind:value={rejectReason}
							/>
							<div class="queue-row__actions">
								<Button type="submit" variant="secondary">Confirm rejection</Button>
							</div>
						</form>
					{:else}
						<div class="queue-row__actions">
							<form method="POST" action="?/approve" use:enhance>
								<input type="hidden" name="caseId" value={item.caseId} />
								<Button type="submit" variant="secondary">Approve</Button>
							</form>
							<Button
								variant="ghost"
								onclick={() => {
									rejectOpenFor = item.caseId;
									rejectReason = '';
								}}
							>
								Reject
							</Button>
						</div>
					{/if}
				</article>
			{/each}
		{/if}
	</div>
</main>

<style>
	.admin-panel {
		padding: 0 var(--space-lg) var(--space-xl);
	}

	.admin-panel--top {
		padding-top: var(--space-lg);
	}

	.headline {
		font-family: var(--font-display-family);
		font-size: var(--font-headline-size);
	}

	.body {
		margin-top: var(--space-sm);
		color: var(--color-stone);
	}

	.admin-empty {
		margin-top: var(--space-md);
	}

	.kpi-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: var(--space-md);
		margin: var(--space-lg) 0;
	}

	.kpi-tile {
		background: var(--color-paper);
		border-radius: var(--radius-md);
		padding: var(--space-md);
		box-shadow: var(--shadow-rest);
	}

	.kpi-label {
		font-size: 0.8125rem;
		color: var(--color-stone);
	}

	.kpi-value {
		font-size: 1.75rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		margin-top: var(--space-xs);
	}

	.kpi-sub {
		font-size: 0.8125rem;
		color: var(--color-stone);
		margin-top: 2px;
	}

	.queue-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.queue-row {
		background: var(--color-paper);
		border-radius: var(--radius-md);
		padding: var(--space-md);
		box-shadow: var(--shadow-rest);
	}

	.queue-row__top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-md);
	}

	.queue-row__who {
		font-weight: 600;
	}

	.queue-row__meta {
		font-size: 0.8125rem;
		color: var(--color-stone);
		margin-top: 2px;
	}

	.queue-row__age {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-stone);
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}

	.queue-row__age.overdue {
		color: var(--color-error);
	}

	.queue-row__body {
		margin-top: var(--space-sm);
		font-size: 0.9375rem;
		color: var(--color-ink);
	}

	.queue-row__actions {
		display: flex;
		gap: var(--space-sm);
		margin-top: var(--space-md);
		flex-wrap: wrap;
	}

	.admin-inline-note {
		margin-top: 6px;
		font-size: 0.8125rem;
		color: var(--color-stone);
	}

	.admin-inline-field {
		margin-top: var(--space-sm);
	}

	.verify-copy {
		margin: 0;
	}

	.profile-context {
		margin-top: var(--space-md);
		padding-top: var(--space-md);
		border-top: 1px solid var(--color-divider);
	}

	.profile-context__title {
		font-size: 0.875rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-stone);
		margin: 0 0 var(--space-sm);
	}

	.doc-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: var(--space-sm);
		margin-top: var(--space-sm);
	}

	.doc-frame {
		margin: 0;
	}

	.doc-frame img {
		width: 100%;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-divider);
		display: block;
	}

	.doc-frame figcaption {
		font-size: 0.75rem;
		color: var(--color-stone);
		margin-top: 4px;
	}

	.form-message {
		color: var(--color-error);
		margin: var(--space-sm) 0;
	}
</style>
