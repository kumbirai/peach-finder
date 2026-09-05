<script lang="ts">
	import {
		ACTIVE_THIS_WEEK_SIGNAL_LABELS,
		ACTIVE_THIS_WEEK_SIGNAL_ORDER,
		formatActiveThisWeekHeadline,
		formatAvailabilitySetDetail,
		isSignalMet,
		type ActiveThisWeekTransparencyUi
	} from '$lib/active-this-week-transparency';

	let { activeThisWeek }: { activeThisWeek: ActiveThisWeekTransparencyUi } = $props();

	const headline = $derived(formatActiveThisWeekHeadline(activeThisWeek.qualifies));
</script>

<div class="active-week-transparency" data-testid="active-this-week-transparency">
	<p class="headline" data-testid="active-this-week-headline">
		{#if activeThisWeek.qualifies}
			<span class="check" aria-hidden="true">✓</span>
		{/if}
		{headline}
	</p>
	<ul class="signal-list" aria-label="Active this week qualifying activity in the last 7 days">
		{#each ACTIVE_THIS_WEEK_SIGNAL_ORDER as key (key)}
			{@const met = isSignalMet(key, activeThisWeek.signals)}
			<li
				class="signal-item"
				class:signal-item--met={met}
				data-testid={`active-this-week-signal-${key}`}
			>
				<span class="signal-marker" aria-hidden="true">{met ? '✓' : '○'}</span>
				<span class="signal-copy">
					<span class="signal-label">{ACTIVE_THIS_WEEK_SIGNAL_LABELS[key]}</span>
					{#if key === 'availabilitySet' && activeThisWeek.signals.availabilitySetCount > 0}
						<span class="signal-detail">
							{formatAvailabilitySetDetail(activeThisWeek.signals.availabilitySetCount)}
						</span>
					{/if}
				</span>
				<span class="visually-hidden">{met ? 'Met' : 'Not met yet'}</span>
			</li>
		{/each}
	</ul>
</div>

<style>
	.active-week-transparency {
		display: grid;
		gap: var(--space-sm);
		margin-top: var(--space-sm);
	}
	.headline {
		margin: 0;
		color: var(--color-pine);
		font-size: 0.8125rem;
		font-weight: 600;
		display: flex;
		align-items: flex-start;
		gap: var(--space-xs);
	}
	.check {
		flex-shrink: 0;
	}
	.signal-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-xs);
	}
	.signal-item {
		display: flex;
		align-items: flex-start;
		gap: var(--space-xs);
		color: var(--color-stone);
		font-size: 0.8125rem;
	}
	.signal-item--met {
		color: var(--color-ink);
	}
	.signal-marker {
		flex-shrink: 0;
		width: 1rem;
		text-align: center;
		font-weight: 700;
		color: var(--color-stone);
	}
	.signal-item--met .signal-marker {
		color: var(--color-pine);
	}
	.signal-copy {
		display: grid;
		gap: 2px;
	}
	.signal-detail {
		color: var(--color-stone);
		font-size: 0.75rem;
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
</style>
