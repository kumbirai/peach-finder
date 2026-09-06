<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import type {
		ChartAnnotationMarker,
		DashboardMetricView,
		ProviderDashboardView
	} from '$lib/server/modules/provider-analytics';
	import {
		chartAnnotationMarkerColor,
		chartAnnotationMarkerSymbol,
		demandTagOwnershipLabel,
		sparklineMarkerX,
		sparklineValueFromTrendLabel
	} from '$lib/provider-analytics-display';

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
	const trendDates = $derived(analytics.profileViews.trend.map((point) => point.date));

	function rangeHref(days: 7 | 30 | 90): string {
		return days === 30 ? '/provider/dashboard' : `/provider/dashboard?range=${days}`;
	}

	function sparklineD(metric: DashboardMetricView): string {
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
			return `M0 ${height / 2} L${width} ${height / 2}`;
		}
		return `M${points.join(' L')}`;
	}

	function markerY(metric: DashboardMetricView, markerDate: string): number {
		const values = metric.trend.map((point) => sparklineValueFromTrendLabel(point.value));
		const index = trendDates.indexOf(markerDate);
		const height = 24;
		if (index < 0) return height / 2;
		const max = Math.max(...values, 1);
		const value = values[index] ?? 2;
		return height - (value / max) * (height - 4) - 2;
	}

	function markersForMetric(
		metric: DashboardMetricView
	): Array<ChartAnnotationMarker & { x: number; y: number }> {
		const width = 90;
		return analytics.chartAnnotations.markers
			.map((marker) => {
				const x = sparklineMarkerX(marker.date, trendDates, width);
				if (x == null) return null;
				return { ...marker, x, y: markerY(metric, marker.date) };
			})
			.filter(
				(marker): marker is ChartAnnotationMarker & { x: number; y: number } => marker !== null
			);
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

	{#if analytics.chartAnnotations.summaries.length > 0}
		<ul
			class="annotation-summaries"
			data-testid="analytics-chart-annotations"
			aria-label="Your activity on the chart"
		>
			{#each analytics.chartAnnotations.summaries as summary (summary.type)}
				<li
					class="annotation-summary"
					class:went-available={summary.type === 'went_available'}
					class:featured={summary.type === 'featured'}
					data-testid={`analytics-chart-summary-${summary.type}`}
				>
					<span class="annotation-symbol" aria-hidden="true">
						{chartAnnotationMarkerSymbol(summary.type)}
					</span>
					<span>{summary.label}</span>
				</li>
			{/each}
		</ul>
	{/if}

	<div class="stat-row">
		<Card>
			<p class="stat-label">Profile views</p>
			<p class="stat-value headline" data-testid="analytics-profile-views">
				{analytics.profileViews.currentTotal}
			</p>
			<p class="comparison label" data-testid="analytics-profile-views-comparison">
				{analytics.profileViews.priorPeriodComparison.changeLabel}
			</p>
			<svg
				width="90"
				height="24"
				viewBox="0 0 90 24"
				fill="none"
				role="img"
				aria-label="Profile views trend with your activity markers"
				data-testid="analytics-profile-views-chart"
			>
				<path
					d={sparklineD(analytics.profileViews)}
					stroke="#B34625"
					stroke-width="2"
					fill="none"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
				{#each markersForMetric(analytics.profileViews) as marker (`profile-${marker.date}-${marker.type}`)}
					<g data-testid={`analytics-chart-marker-${marker.type}-${marker.date}`}>
						<title>{marker.label} on {marker.date}</title>
						<text
							x={marker.x}
							y={marker.y - 4}
							text-anchor="middle"
							font-size="8"
							fill={chartAnnotationMarkerColor(marker.type)}
						>
							{chartAnnotationMarkerSymbol(marker.type)}
						</text>
					</g>
				{/each}
			</svg>
		</Card>
		<Card>
			<p class="stat-label">Search appearances</p>
			<p class="stat-value headline" data-testid="analytics-search-appearances">
				{analytics.searchAppearances.currentTotal}
			</p>
			<p class="comparison label" data-testid="analytics-search-appearances-comparison">
				{analytics.searchAppearances.priorPeriodComparison.changeLabel}
			</p>
			<svg
				width="90"
				height="24"
				viewBox="0 0 90 24"
				fill="none"
				role="img"
				aria-label="Search appearances trend with your activity markers"
				data-testid="analytics-search-appearances-chart"
			>
				<path
					d={sparklineD(analytics.searchAppearances)}
					stroke="#2F5D50"
					stroke-width="2"
					fill="none"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
				{#each markersForMetric(analytics.searchAppearances) as marker (`search-${marker.date}-${marker.type}`)}
					<g data-testid={`analytics-chart-marker-${marker.type}-${marker.date}`}>
						<title>{marker.label} on {marker.date}</title>
						<text
							x={marker.x}
							y={marker.y - 4}
							text-anchor="middle"
							font-size="8"
							fill={chartAnnotationMarkerColor(marker.type)}
						>
							{chartAnnotationMarkerSymbol(marker.type)}
						</text>
					</g>
				{/each}
			</svg>
		</Card>
		<Card>
			<p class="stat-label">Contact requests</p>
			<p class="stat-value headline" data-testid="analytics-contact-requests">
				{analytics.contactRequests.currentTotal}
			</p>
			<p class="comparison label" data-testid="analytics-contact-requests-comparison">
				{analytics.contactRequests.priorPeriodComparison.changeLabel}
			</p>
			<svg
				width="90"
				height="24"
				viewBox="0 0 90 24"
				fill="none"
				role="img"
				aria-label="Contact requests trend with your activity markers"
				data-testid="analytics-contact-requests-chart"
			>
				<path
					d={sparklineD(analytics.contactRequests)}
					stroke="#B34625"
					stroke-width="2"
					fill="none"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
				{#each markersForMetric(analytics.contactRequests) as marker (`contact-${marker.date}-${marker.type}`)}
					<g data-testid={`analytics-chart-marker-${marker.type}-${marker.date}`}>
						<title>{marker.label} on {marker.date}</title>
						<text
							x={marker.x}
							y={marker.y - 4}
							text-anchor="middle"
							font-size="8"
							fill={chartAnnotationMarkerColor(marker.type)}
						>
							{chartAnnotationMarkerSymbol(marker.type)}
						</text>
					</g>
				{/each}
			</svg>
		</Card>
		<Card>
			<p class="stat-label">Most searched service</p>
			{#if topService}
				<p
					class="stat-value text"
					data-testid="analytics-most-searched-service"
					class:mine={topService.isMine}
					class:not-mine={!topService.isMine}
				>
					{topService.tag}
				</p>
				<p
					class="comparison label"
					class:mine={topService.isMine}
					data-testid="analytics-most-searched-ownership"
				>
					{demandTagOwnershipLabel(topService.isMine)}
				</p>
			{:else}
				<p class="stat-value text" data-testid="analytics-most-searched-service">—</p>
			{/if}
		</Card>
	</div>

	{#if analytics.mostSearchedServices.length > 0}
		<div class="demand-signals" data-testid="analytics-demand-signals">
			<h3 class="demand-heading label">Demand signals you can act on</h3>
			<p class="body demand-copy">
				Platform-wide most-searched services. Tags you already offer are highlighted so you can spot
				gaps.
			</p>
			<ul class="tag-list" aria-label="Top searched services">
				{#each analytics.mostSearchedServices as service (service.tagId)}
					<li
						class="tag-item"
						class:mine={service.isMine}
						class:not-mine={!service.isMine}
						data-testid={`analytics-demand-tag-${service.tagId}`}
					>
						<div class="tag-main">
							<span class="tag-name">{service.tag}</span>
							<span class="ownership label" data-testid="analytics-demand-ownership">
								{demandTagOwnershipLabel(service.isMine)}
							</span>
						</div>
						<span class="rank label">#{service.demandRank}</span>
					</li>
				{/each}
			</ul>
		</div>
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
	.annotation-summaries {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-xs);
	}
	.annotation-summary {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		font-size: 0.875rem;
		font-weight: 600;
	}
	.annotation-summary.went-available {
		color: var(--color-peach-deep);
	}
	.annotation-summary.featured {
		color: var(--color-pine);
	}
	.annotation-symbol {
		font-size: 0.75rem;
		line-height: 1;
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
	.stat-value.not-mine {
		color: var(--color-peach-deep);
	}
	.comparison {
		margin: var(--space-xs) 0 var(--space-sm);
		color: var(--color-stone);
	}
	.comparison.mine {
		color: var(--color-pine);
	}
	.demand-signals {
		border: 1px solid var(--color-divider);
		border-radius: var(--radius-card);
		padding: var(--space-md);
		background: var(--color-paper);
		box-shadow: var(--shadow-rest);
	}
	.demand-heading {
		margin: 0;
		color: var(--color-ink);
	}
	.demand-copy {
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
		align-items: flex-start;
		gap: var(--space-sm);
		padding: var(--space-sm) 0;
		border-bottom: 1px solid var(--color-divider);
		color: var(--color-stone);
	}
	.tag-item:last-child {
		border-bottom: 0;
		padding-bottom: 0;
	}
	.tag-main {
		display: grid;
		gap: 2px;
	}
	.tag-name {
		font-weight: 600;
		color: var(--color-peach-deep);
	}
	.tag-item.mine .tag-name,
	.tag-item.mine .ownership {
		color: var(--color-pine);
	}
	.tag-item.not-mine .tag-name {
		color: var(--color-peach-deep);
	}
	.ownership {
		color: var(--color-stone);
	}
	.rank {
		color: var(--color-stone);
		flex-shrink: 0;
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
