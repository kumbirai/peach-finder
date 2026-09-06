<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import type {
		DashboardMetricView,
		ProviderDashboardView
	} from '$lib/server/modules/provider-analytics';
	import { sparklineValueFromTrendLabel } from '$lib/provider-analytics-display';

	let {
		analytics,
		rangeDays
	}: {
		analytics: ProviderDashboardView;
		rangeDays: 7 | 30 | 90;
	} = $props();

	const ranges: Array<{ days: 7 | 30 | 90; label: string }> = [
		{ days: 7, label: '7 days' },
		{ days: 30, label: '30 days' },
		{ days: 90, label: '90 days' }
	];

	const topService = $derived(analytics.mostSearchedServices[0] ?? null);

	function rangeHref(days: 7 | 30 | 90): string {
		const params = new URLSearchParams();
		if (days !== 30) params.set('range', String(days));
		const query = params.toString();
		return query ? `/provider/dashboard?${query}` : '/provider/dashboard';
	}

	function sparklinePath(metric: DashboardMetricView, stroke: string): string {
		const values = metric.trend.map((point) => sparklineValueFromTrendLabel(point.value));
		const max = Math.max(...values, 1);
		const width = 90;
		const height = 24;
		const step = values.length > 1 ? width / (values.length - 1) : width;
		const points = values.map((value, index) => {
			const x = index * step;
			const y = height - (value / max) * (height - 4) - 2;
			return `${x} ${y}`;
		});
		if (points.length === 0) {
			return `<path d="M0 ${height / 2} L${width} ${height / 2}" stroke="${stroke}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
		}
		return `<path d="M${points.join(' L')}" stroke="${stroke}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
	}
</script>

<section class="section" aria-labelledby="analytics-heading" data-testid="provider-analytics">
	<div class="section-header">
		<div>
			<h2 id="analytics-heading" class="title">Your reach</h2>
			<p class="body hint">See how seekers find and contact you.</p>
		</div>
		<div class="range-switch" role="group" aria-label="Analytics date range">
			{#each ranges as range (range.days)}
				<a
					class="range-btn"
					href={rangeHref(range.days)}
					aria-current={rangeDays === range.days ? 'true' : undefined}
					data-testid={`analytics-range-${range.days}`}
				>
					{range.label}
				</a>
			{/each}
		</div>
	</div>

	<details class="definitions" data-testid="analytics-definitions">
		<summary class="definitions-summary label">How these numbers are counted</summary>
		<ul class="definitions-list body">
			<li><strong>Profile views:</strong> {analytics.definitions.profileView}</li>
			<li><strong>Search appearances:</strong> {analytics.definitions.searchAppearance}</li>
			<li><strong>Contact requests:</strong> {analytics.definitions.contactRequest}</li>
		</ul>
	</details>

	<div class="stat-row">
		<Card>
			<p class="stat-label label">Profile views</p>
			<p class="stat-value headline" data-testid="analytics-profile-views">
				{analytics.profileViews.currentTotal}
			</p>
			<p class="comparison label" data-testid="analytics-profile-views-comparison">
				{analytics.profileViews.priorPeriodComparison.changeLabel}
			</p>
			<svg width="90" height="24" viewBox="0 0 90 24" fill="none" aria-hidden="true">
				{@html sparklinePath(analytics.profileViews, '#B34625')}
			</svg>
		</Card>
		<Card>
			<p class="stat-label label">Search appearances</p>
			<p class="stat-value headline" data-testid="analytics-search-appearances">
				{analytics.searchAppearances.currentTotal}
			</p>
			<p class="comparison label" data-testid="analytics-search-appearances-comparison">
				{analytics.searchAppearances.priorPeriodComparison.changeLabel}
			</p>
			<svg width="90" height="24" viewBox="0 0 90 24" fill="none" aria-hidden="true">
				{@html sparklinePath(analytics.searchAppearances, '#2F5D50')}
			</svg>
		</Card>
		<Card>
			<p class="stat-label label">Contact requests</p>
			<p class="stat-value headline" data-testid="analytics-contact-requests">
				{analytics.contactRequests.currentTotal}
			</p>
			<p class="comparison label" data-testid="analytics-contact-requests-comparison">
				{analytics.contactRequests.priorPeriodComparison.changeLabel}
			</p>
			<svg width="90" height="24" viewBox="0 0 90 24" fill="none" aria-hidden="true">
				{@html sparklinePath(analytics.contactRequests, '#B34625')}
			</svg>
		</Card>
		<Card>
			<p class="stat-label label">Most searched service</p>
			{#if topService}
				<p
					class="stat-value text"
					data-testid="analytics-most-searched-service"
					class:mine={topService.isMine}
				>
					{topService.tag}
				</p>
			{:else}
				<p class="stat-value text" data-testid="analytics-most-searched-service">—</p>
			{/if}
			{#if topService && !topService.isMine}
				<p class="comparison label">You do not offer this tag yet.</p>
			{:else if topService?.isMine}
				<p class="comparison label">One of your offered tags.</p>
			{/if}
		</Card>
	</div>

	{#if analytics.mostSearchedServices.length > 1}
		<ul class="tag-list" aria-label="Top searched services">
			{#each analytics.mostSearchedServices.slice(1) as service (service.tagId)}
				<li class="tag-item" class:mine={service.isMine}>
					<span>{service.tag}</span>
					<span class="rank label">#{service.demandRank}</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.section {
		display: grid;
		gap: var(--space-md);
	}
	.section-header {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-md);
		align-items: flex-start;
		justify-content: space-between;
	}
	.hint {
		margin: var(--space-xs) 0 0;
		color: var(--color-stone);
	}
	.range-switch {
		display: inline-flex;
		gap: 2px;
		padding: 3px;
		background: var(--color-blush);
		border-radius: var(--radius-pill);
	}
	.range-btn {
		min-height: 44px;
		padding: 6px 12px;
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--color-stone);
		font-weight: 600;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.range-btn[aria-current='true'] {
		background: var(--color-paper);
		color: var(--color-ink);
		box-shadow: var(--shadow-rest);
	}
	.range-btn:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
	}
	.definitions {
		border: 1px solid var(--color-divider);
		border-radius: var(--radius-card-nested);
		padding: var(--space-sm) var(--space-md);
		background: var(--color-paper);
	}
	.definitions-summary {
		cursor: pointer;
		color: var(--color-stone);
	}
	.definitions-list {
		margin: var(--space-sm) 0 0;
		padding-left: 1.25rem;
		color: var(--color-stone);
		display: grid;
		gap: var(--space-xs);
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
		font-variant-numeric: tabular-nums;
	}
	.stat-value.text {
		font-family: var(--font-body);
		font-size: 1rem;
		font-weight: 600;
		line-height: 1.35;
	}
	.stat-value.mine {
		color: var(--color-pine);
	}
	.comparison {
		margin: var(--space-xs) 0 var(--space-sm);
		color: var(--color-stone);
	}
	.tag-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-xs);
	}
	.tag-item {
		display: flex;
		justify-content: space-between;
		gap: var(--space-sm);
		padding: var(--space-xs) 0;
		border-bottom: 1px solid var(--color-divider);
		color: var(--color-stone);
	}
	.tag-item.mine {
		color: var(--color-pine);
		font-weight: 600;
	}
	.rank {
		color: var(--color-stone);
	}
	@media (min-width: 768px) {
		.stat-row {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.range-btn {
			transition: none;
		}
	}
</style>
