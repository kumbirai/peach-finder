<script lang="ts">
	import {
		BADGE_EXPLANATIONS,
		BADGE_LABELS,
		SAFETY_PAGE_PATH,
		isTrustBadgeKind
	} from '$lib/trust-badges';

	let {
		kind = 'verified',
		label
	}: {
		kind?: 'verified' | 'available' | 'active-week';
		label?: string;
	} = $props();

	let expanded = $state(false);
	const tipId = `badge-tip-${crypto.randomUUID()}`;

	const text = $derived(
		label ??
			(isTrustBadgeKind(kind)
				? BADGE_LABELS[kind]
				: kind === 'available'
					? 'Available now'
					: 'Identity verified')
	);
	const explanation = $derived(isTrustBadgeKind(kind) ? BADGE_EXPLANATIONS[kind] : null);
	const interactive = $derived(isTrustBadgeKind(kind));

	function onBadgePointerDown(event: PointerEvent) {
		if (!expanded) {
			event.preventDefault();
		}
	}

	function onBadgeClick(event: MouseEvent) {
		if (!expanded) {
			event.preventDefault();
			expanded = true;
		}
	}

	function onBadgeBlur(event: FocusEvent) {
		const next = event.relatedTarget as Node | null;
		if (!next || !(event.currentTarget as HTMLElement).contains(next)) {
			expanded = false;
		}
	}
</script>

{#if interactive}
	<a
		href={SAFETY_PAGE_PATH}
		class="badge badge-{kind} badge-interactive"
		data-component="badge"
		data-kind={kind}
		data-testid="trust-badge-{kind}"
		aria-describedby={tipId}
		data-expanded={expanded ? 'true' : undefined}
		aria-expanded={expanded}
		onpointerdown={onBadgePointerDown}
		onclick={onBadgeClick}
		onblur={onBadgeBlur}
	>
		{#if kind === 'verified' || kind === 'active-week'}
			<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				{#if kind === 'verified'}
					<path
						d="M9 12l2 2 4-4"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
					<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" />
				{:else}
					<path
						d="M3 12h4l2-7 4 14 2-7h6"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				{/if}
			</svg>
		{/if}
		<span class="text">{text}</span>
		<span id={tipId} class="explanation" role="tooltip">{explanation}</span>
	</a>
{:else}
	<span class="badge badge-{kind}" data-component="badge" data-kind={kind}>
		<span class="dot" aria-hidden="true"></span>
		<span class="text">{text}</span>
	</span>
{/if}

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		background: var(--color-blush);
		font-family: var(--font-label-family);
		font-size: var(--font-label-size);
		font-weight: var(--font-label-weight);
		letter-spacing: var(--font-label-letter-spacing);
		border-radius: var(--radius-pill);
		padding: 4px 10px;
		position: relative;
	}
	.badge-interactive {
		text-decoration: none;
		min-height: 44px;
		padding-inline: 12px;
		cursor: pointer;
	}
	.badge-interactive:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
	}
	.badge-verified {
		color: var(--color-pine);
	}
	.badge-active-week {
		background: var(--color-paper);
		color: var(--color-pine);
	}
	.badge-available {
		color: var(--color-peach-deep-hover);
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
	}
	.explanation {
		display: none;
		position: absolute;
		left: 0;
		top: calc(100% + 6px);
		z-index: 2;
		min-width: min(18rem, 70vw);
		max-width: 22rem;
		padding: 10px 12px;
		border-radius: var(--radius-md);
		background: var(--color-paper);
		color: var(--color-ink);
		box-shadow: var(--shadow-lift-hover);
		font-family: var(--font-body-family);
		font-size: 0.8125rem;
		font-weight: 400;
		letter-spacing: normal;
		line-height: 1.4;
		white-space: normal;
	}
	.badge-interactive:hover .explanation,
	.badge-interactive:focus-visible .explanation,
	.badge-interactive[data-expanded='true'] .explanation {
		display: block;
	}
	@media (prefers-reduced-motion: no-preference) {
		.explanation {
			animation: badge-tip-in 120ms ease-out;
		}
	}
	@keyframes badge-tip-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
