<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';

	let { data } = $props();

	function contactLine(item: (typeof data.results)[number]): string {
		const parts: string[] = [];
		if (item.email) parts.push(item.email);
		if (item.phone) parts.push(item.phone);
		return parts.join(' · ');
	}

	function badgeSummary(item: (typeof data.results)[number]): string {
		const parts: string[] = [];
		if (item.identityVerified) parts.push('Identity verified');
		if (item.activeThisWeek) parts.push('Active this week');
		if (parts.length === 0) return 'No badges';
		return parts.join(' · ');
	}
</script>

<main class="admin-panel admin-panel--top" data-testid="admin-account-lookup">
	<h1 class="headline">Account lookup</h1>
	<p class="body intro">
		Search by name, email, or phone. Read-only aggregation of badge, billing, and report state — no
		impersonation.
	</p>

	<form class="admin-search" method="GET" action="/admin/accounts" role="search">
		<Input
			id="admin-account-search"
			name="q"
			label="Search accounts"
			type="search"
			placeholder="Name, email, or phone"
			value={data.query}
			autocomplete="off"
		/>
		<div class="search-actions">
			<Button type="submit" variant="secondary">Search</Button>
		</div>
	</form>

	{#if data.query.length > 0 && data.query.length < 2}
		<p class="body admin-empty">Enter at least two characters to search.</p>
	{:else if data.query.length >= 2 && data.results.length === 0}
		<p class="body admin-empty" data-testid="account-lookup-empty">
			No accounts match that search.
		</p>
	{:else if data.results.length > 0}
		<div class="queue-list" data-testid="account-lookup-results">
			{#each data.results as item (item.userId)}
				<article class="queue-row" data-testid="account-lookup-item" data-user-id={item.userId}>
					<div class="queue-row__top">
						<div>
							<div class="queue-row__who">
								{item.displayName}
								{#if item.email || item.phone}
									<span class="queue-row__contact"> · {contactLine(item)}</span>
								{/if}
							</div>
							<div class="queue-row__meta">
								{item.roleLabel} · {item.verificationLabel} · joined {item.joinedLabel}
							</div>
						</div>
						{#if item.listingLabel}
							<span class="status-chip status-chip--active" data-testid="listing-state-chip">
								{item.listingLabel}
							</span>
						{:else if item.providerProfileId}
							<span class="status-chip">No listing</span>
						{/if}
					</div>

					<div class="queue-row__body" data-testid="account-summary-line">
						{badgeSummary(item)} · {item.openReportsCount} open report{item.openReportsCount === 1
							? ''
							: 's'} · last moderation action: {item.lastModerationLabel}
					</div>

					<div class="queue-row__actions">
						<details class="detail-disclosure" data-testid="account-report-history">
							<summary class="detail-disclosure__summary">View report history</summary>
							<div class="detail-panel">
								<h2 class="detail-panel__title">Report history</h2>
								{#if item.reportHistory.length === 0}
									<p class="body">No reports filed or received.</p>
								{:else}
									<ul class="history-list">
										{#each item.reportHistory as report (report.reportId)}
											<li>
												{report.role === 'filed' ? 'Filed' : 'Received'} · {report.reasonLabel} ·
												{report.status} · {new Date(report.createdAt).toLocaleDateString('en-ZA')}
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						</details>

						{#if item.providerProfileId && item.billing}
							<details class="detail-disclosure" data-testid="account-billing-state">
								<summary class="detail-disclosure__summary">View billing state</summary>
								<div class="detail-panel">
									<h2 class="detail-panel__title">Billing / listing state</h2>
									<dl class="billing-facts">
										<dt>Listing state</dt>
										<dd>{item.billing.listingLabel} ({item.billing.state})</dd>
										{#if item.billing.trialEndsAt}
											<dt>Trial ends</dt>
											<dd>{new Date(item.billing.trialEndsAt).toLocaleDateString('en-ZA')}</dd>
										{/if}
										<dt>Last updated</dt>
										<dd>{new Date(item.billing.updatedAt).toLocaleDateString('en-ZA')}</dd>
									</dl>
								</div>
							</details>
						{/if}
					</div>
				</article>
			{/each}
		</div>
	{/if}

	<p class="verify-copy verify-copy--spaced">
		Account lookup is read-only aggregation of badge, billing, and report state. There is no "log in
		as user" control anywhere in the console, by design.
	</p>
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

	.intro {
		max-width: 40rem;
	}

	.admin-search {
		margin-top: var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		max-width: 28rem;
	}

	.search-actions {
		display: flex;
		gap: var(--space-sm);
	}

	.admin-empty {
		margin-top: var(--space-md);
	}

	.queue-list {
		margin-top: var(--space-lg);
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
		justify-content: space-between;
		gap: var(--space-md);
		align-items: flex-start;
	}

	.queue-row__who {
		font-weight: 700;
	}

	.queue-row__contact {
		font-weight: 400;
		color: var(--color-stone);
	}

	.queue-row__meta {
		margin-top: var(--space-xs);
		font-size: 0.875rem;
		color: var(--color-stone);
	}

	.status-chip {
		flex-shrink: 0;
		border-radius: 999px;
		padding: 6px 12px;
		font-size: 0.75rem;
		font-weight: 700;
		background: var(--color-divider);
		color: var(--color-ink);
		white-space: nowrap;
	}

	.status-chip--active {
		background: color-mix(in srgb, var(--color-pine) 12%, var(--color-paper));
		color: var(--color-pine);
		border: 1px solid color-mix(in srgb, var(--color-pine) 35%, transparent);
	}

	.queue-row__body {
		margin-top: var(--space-sm);
		font-size: 0.9375rem;
		color: var(--color-stone);
	}

	.queue-row__actions {
		margin-top: var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.detail-disclosure {
		border-radius: var(--radius-pill);
	}

	.detail-disclosure__summary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		padding: 13px 27px;
		border-radius: var(--radius-pill);
		border: 1px solid var(--color-stone);
		background: var(--color-paper);
		color: var(--color-pine);
		font-family: var(--font-title-family);
		font-size: var(--font-title-size);
		font-weight: var(--font-title-weight);
		cursor: pointer;
		list-style: none;
		width: fit-content;
	}

	.detail-disclosure__summary::-webkit-details-marker {
		display: none;
	}

	.detail-disclosure__summary:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
	}

	.detail-panel {
		margin-top: var(--space-md);
		padding-top: var(--space-md);
	}

	.detail-panel__title {
		font-size: 0.9375rem;
		font-weight: 700;
		margin: 0 0 var(--space-sm);
	}

	.history-list {
		margin: 0;
		padding-left: 1.25rem;
		color: var(--color-stone);
		font-size: 0.875rem;
	}

	.billing-facts {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-xs) var(--space-md);
		font-size: 0.875rem;
		margin: 0;
	}

	.billing-facts dt {
		font-weight: 700;
		color: var(--color-stone);
	}

	.billing-facts dd {
		margin: 0;
		color: var(--color-ink);
	}

	.verify-copy {
		margin-top: var(--space-lg);
		font-size: 0.875rem;
		color: var(--color-stone);
		max-width: 40rem;
	}

	.verify-copy--spaced {
		margin-top: var(--space-xl);
	}
</style>
