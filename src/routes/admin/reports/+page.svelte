<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import PublicProfileView from '$lib/components/PublicProfileView.svelte';
	import type { PublicProfile } from '$lib/types/profile';

	let { data, form } = $props();

	let dismissOpenFor = $state<string | null>(null);
	let dismissNote = $state('');
	// svelte-ignore state_referenced_locally -- intentional: one-time seed of the open dialog from the deep-link query param
	let actOpenFor = $state<string | null>(data.actReportId);
	let actReason = $state('');
	let actAction = $state('unpublish');

	const actionLabels: Record<string, string> = {
		remove_photo: 'Remove photo',
		remove_review: 'Remove review',
		unpublish: 'Unpublish profile',
		suspend: 'Suspend account',
		reinstate: 'Reinstate account',
		revoke_badge: 'Revoke identity badge'
	};

	function statsLabel(hours: number | null): string {
		if (hours === null) return 'no open reports';
		if (hours < 24) return `avg age ${Math.round(hours)} hours`;
		const days = Math.round(hours / 24);
		return `avg age ${days} day${days === 1 ? '' : 's'}`;
	}
</script>

<main class="admin-panel admin-panel--top" data-testid="admin-reports-queue">
	<h1 class="headline">Reports queue</h1>

	<div class="kpi-row" aria-label="Queue summary">
		<div class="kpi-tile">
			<div class="kpi-label">Reports queue</div>
			<div class="kpi-value">{data.stats.openCount}</div>
			<div class="kpi-sub">open · {statsLabel(data.stats.avgAgeHours)}</div>
		</div>
	</div>

	{#if form?.message}
		<p class="form-message" role="alert">{form.message}</p>
	{/if}

	<div class="queue-list">
		{#if data.queue.length === 0}
			<p class="body admin-empty">Reports queue is empty. Nothing open.</p>
		{:else}
			{#each data.queue as item (item.reportId)}
				<article class="queue-row" data-testid="reports-queue-item" data-report-id={item.reportId}>
					<div class="queue-row__top">
						<div>
							<div class="queue-row__who">Report: {item.reasonLabel}</div>
							<div class="queue-row__meta">
								Target: {item.targetLabel} · {item.historySummary}
							</div>
						</div>
						<span class="queue-row__age" class:overdue={item.overdue} data-testid="queue-age">
							{item.queueAgeLabel}
						</span>
					</div>

					<div class="report-context" data-testid="report-context">
						<dl class="report-context__facts">
							<dt>Reporter</dt>
							<dd>{item.reporterDisplayName}</dd>
							<dt>Reported party</dt>
							<dd>{item.reportedPartyDisplayName}</dd>
							<dt>Reason</dt>
							<dd>{item.reasonLabel}</dd>
						</dl>
						{#if item.freeText}
							<p class="report-context__note">{item.freeText}</p>
						{/if}

						{#if item.threadMessages?.length}
							<div class="thread-context" data-testid="report-thread-context">
								<h2 class="context-title">Reported thread</h2>
								<ul class="thread-messages">
									{#each item.threadMessages as message (message.sentAt + message.body)}
										<li>
											<span class="thread-messages__who">{message.senderDisplayName}</span>
											<span class="thread-messages__body">{message.body}</span>
										</li>
									{/each}
								</ul>
							</div>
						{/if}

						{#if item.profile}
							<div class="profile-context" data-testid="report-profile-context">
								<h2 class="context-title">Reported profile</h2>
								<PublicProfileView profile={item.profile as PublicProfile} previewMode={true} />
							</div>
						{/if}

						{#if item.review}
							<div class="review-context" data-testid="report-review-context">
								<h2 class="context-title">Reported review</h2>
								<p class="review-snippet">
									{item.review.rating} stars on {item.review.providerDisplayName}'s profile
								</p>
								{#if item.review.body}
									<p class="review-snippet">{item.review.body}</p>
								{/if}
								{#if item.review.replyBody}
									<p class="review-snippet review-snippet--reply">Reply: {item.review.replyBody}</p>
								{/if}
							</div>
						{/if}

						{#if item.photo}
							<div class="photo-context" data-testid="report-photo-context">
								<h2 class="context-title">Reported photo</h2>
								<p class="review-snippet">
									Photo on {item.photo.ownerDisplayName}'s profile
								</p>
							</div>
						{/if}

						{#if item.priorReports.length > 0}
							<div class="history-context" data-testid="report-history">
								<h2 class="context-title">Prior reports on this target</h2>
								<ul class="history-list">
									{#each item.priorReports as prior (prior.reportId)}
										<li>
											{prior.reasonLabel} · {prior.status} ·
											{new Date(prior.createdAt).toLocaleDateString()}
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</div>

					{#if dismissOpenFor === item.reportId}
						<form
							class="dismiss-note admin-inline-field"
							method="POST"
							action="?/dismiss"
							use:enhance={() => {
								return async ({ update }) => {
									await update();
									dismissOpenFor = null;
									dismissNote = '';
								};
							}}
						>
							<input type="hidden" name="reportId" value={item.reportId} />
							<Input
								id={`dismiss-${item.reportId}`}
								name="note"
								label="Dismissal note"
								placeholder="Resolution note (required)"
								bind:value={dismissNote}
							/>
							<div class="queue-row__actions">
								<Button type="submit" variant="secondary">Confirm dismissal</Button>
							</div>
						</form>
					{:else if actOpenFor === item.reportId}
						<p class="verify-copy admin-inline-note" data-testid="moderation-action-note">
							Opens the moderation-action picker — remove photo, remove review, unpublish, suspend,
							revoke badge — each requires a recorded reason.
						</p>
						<form
							class="act-reason admin-inline-field"
							method="POST"
							action="?/act"
							use:enhance={() => {
								return async ({ update }) => {
									await update();
									actOpenFor = null;
									actReason = '';
									actAction = 'unpublish';
								};
							}}
						>
							<input type="hidden" name="reportId" value={item.reportId} />
							<label class="field-label" for={`action-${item.reportId}`}>Action</label>
							<select
								id={`action-${item.reportId}`}
								name="action"
								class="field-select"
								bind:value={actAction}
								data-testid="moderation-action-picker"
							>
								{#each data.moderationActions as moderationAction (moderationAction)}
									<option value={moderationAction}>{actionLabels[moderationAction]}</option>
								{/each}
							</select>
							<Input
								id={`act-${item.reportId}`}
								name="reason"
								label="Action reason"
								placeholder="Reason (required, shared with affected party)"
								bind:value={actReason}
							/>
							<div class="queue-row__actions">
								<Button type="submit" variant="secondary"
									>Confirm {actionLabels[actAction] ?? 'action'}</Button
								>
								<Button
									type="button"
									variant="ghost"
									onclick={() => {
										actOpenFor = null;
										actReason = '';
										actAction = 'unpublish';
									}}
								>
									Cancel
								</Button>
							</div>
						</form>
					{:else}
						<div class="queue-row__actions">
							<Button
								variant="secondary"
								onclick={() => {
									dismissOpenFor = item.reportId;
									dismissNote = '';
									actOpenFor = null;
								}}
							>
								Dismiss
							</Button>
							<Button variant="ghost" href={`/admin/reports?act=${item.reportId}`}>
								Take action
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

	.queue-row__actions {
		display: flex;
		gap: var(--space-sm);
		margin-top: var(--space-md);
		flex-wrap: wrap;
	}

	.report-context {
		margin-top: var(--space-md);
		padding-top: var(--space-md);
		border-top: 1px solid var(--color-divider);
	}

	.report-context__facts {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-xs) var(--space-md);
		margin: 0;
	}

	.report-context__facts dt {
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-stone);
	}

	.report-context__facts dd {
		margin: 0;
		font-size: 0.9375rem;
	}

	.report-context__note {
		margin: var(--space-sm) 0 0;
		font-size: 0.875rem;
		color: var(--color-ink);
	}

	.context-title {
		font-size: 0.875rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-stone);
		margin: var(--space-md) 0 var(--space-sm);
	}

	.thread-messages {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	.thread-messages li {
		padding: var(--space-sm);
		background: var(--color-paper-warm);
		border-radius: var(--radius-sm);
	}

	.thread-messages__who {
		display: block;
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--color-stone);
	}

	.thread-messages__body {
		display: block;
		margin-top: 2px;
		font-size: 0.9375rem;
	}

	.profile-context {
		margin-top: var(--space-sm);
	}

	.review-snippet {
		margin: 0 0 var(--space-xs);
		font-size: 0.9375rem;
	}

	.review-snippet--reply {
		color: var(--color-stone);
	}

	.history-list {
		margin: 0;
		padding-left: 1.25rem;
		font-size: 0.875rem;
		color: var(--color-stone);
	}

	.admin-inline-note {
		margin-top: 6px;
		font-size: 0.8125rem;
		color: var(--color-stone);
	}

	.admin-inline-field {
		margin-top: var(--space-sm);
	}

	.field-label {
		display: block;
		font-size: 0.8125rem;
		font-weight: 700;
		color: var(--color-stone);
		margin-bottom: var(--space-xs);
	}

	.field-select {
		width: 100%;
		border-radius: 14px;
		border: 1px solid var(--color-divider);
		padding: 12px 16px;
		min-height: 44px;
		font: inherit;
		background: var(--color-paper);
		margin-bottom: var(--space-sm);
	}

	.field-select:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
	}

	.verify-copy {
		margin: 0;
	}

	.form-message {
		color: var(--color-error);
		margin: var(--space-sm) 0;
	}
</style>
