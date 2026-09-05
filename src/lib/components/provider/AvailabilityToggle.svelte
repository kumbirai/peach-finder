<script lang="ts">
	import { enhance } from '$app/forms';

	export type AvailabilityUiState = {
		state: 'not_available' | 'available' | 'expiry_warned';
		setAt: string | null;
		expiresAt: string | null;
		expiresInSeconds: number | null;
	};

	let {
		availability,
		variant = 'hero',
		formAction = '?/toggleAvailability'
	}: {
		availability: Pick<AvailabilityUiState, 'state' | 'expiresAt'>;
		variant?: 'hero' | 'compact';
		formAction?: string;
	} = $props();

	let saving = $state(false);
	let errorMessage = $state<string | null>(null);
	let userOverride = $state<boolean | null>(null);

	const serverLive = $derived(availability.state !== 'not_available');
	const live = $derived(userOverride ?? serverLive);
	const expiresAtLabel = $derived(formatExpiryLabel(availability.expiresAt));

	function formatExpiryLabel(expiresAt: string | null): string | null {
		if (!expiresAt) return null;
		const date = new Date(expiresAt);
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function statusHeadline(isLive: boolean): string {
		return isLive ? "You're available now" : "You're away";
	}

	function statusCopy(isLive: boolean, expiryLabel: string | null): string {
		if (!isLive) {
			return 'Your profile remains listed, but you no longer appear in the available-now group.';
		}
		if (expiryLabel) {
			return `Shown first to nearby seekers. Expires at ${expiryLabel}, and we'll remind you before it does.`;
		}
		return 'Shown first to nearby seekers looking right now.';
	}
</script>

<form
	class="availability-control"
	class:availability-control--hero={variant === 'hero'}
	class:availability-control--compact={variant === 'compact'}
	method="POST"
	action={formAction}
	use:enhance={() => {
		if (saving) return;

		const previous = live;
		const next = !live;
		saving = true;
		errorMessage = null;
		userOverride = next;

		return async ({ result, update }) => {
			try {
				if (result.type === 'failure') {
					userOverride = previous;
					errorMessage = 'Could not update your availability. Please try again.';
					return;
				}
				userOverride = null;
				await update();
			} finally {
				saving = false;
			}
		};
	}}
>
	<div class="copy">
		<h2 class="status-headline" id="availability-status-label">{statusHeadline(live)}</h2>
		<p class="body status-copy" id="availability-status-copy">{statusCopy(live, expiresAtLabel)}</p>
		{#if live}
			<p class="live-hint label" aria-live="polite">
				<span class="live-dot" aria-hidden="true"></span>
				Available now
			</p>
		{/if}
	</div>
	<button
		type="submit"
		class="toggle"
		role="switch"
		aria-checked={live}
		aria-labelledby="availability-status-label"
		aria-describedby="availability-status-copy"
		disabled={saving}
		data-testid="availability-toggle"
	></button>
	{#if errorMessage}
		<p class="error label" role="alert">{errorMessage}</p>
	{/if}
</form>

<style>
	.availability-control {
		display: grid;
		gap: var(--space-sm);
	}
	.availability-control--hero {
		background: var(--color-paper);
		border-radius: var(--radius-lg);
		padding: var(--space-lg);
		box-shadow: var(--shadow-rest);
		grid-template-columns: 1fr auto;
		align-items: center;
	}
	.availability-control--compact {
		grid-template-columns: 1fr auto;
		align-items: flex-start;
		gap: var(--space-md);
	}
	.copy {
		display: grid;
		gap: var(--space-xs);
		min-width: 0;
	}
	.status-headline {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 500;
		font-size: 1.375rem;
		color: var(--color-ink);
	}
	.status-copy {
		margin: 0;
		color: var(--color-stone);
	}
	.live-hint {
		margin: var(--space-xs) 0 0;
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		color: var(--color-peach-deep);
		font-weight: 600;
	}
	.live-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-peach-deep);
		animation: pulse var(--motion-pulse-availability) var(--motion-ease-out-expo) infinite;
	}
	.error {
		grid-column: 1 / -1;
		margin: 0;
		color: var(--color-peach-deep);
	}
	.toggle {
		position: relative;
		width: 60px;
		height: 44px;
		border-radius: var(--radius-pill);
		cursor: pointer;
		flex-shrink: 0;
		border: none;
		background: transparent;
		padding: 0;
	}
	.toggle:disabled {
		cursor: wait;
		opacity: 0.7;
	}
	.toggle::before {
		content: '';
		position: absolute;
		top: 7px;
		left: 4px;
		width: 52px;
		height: 30px;
		border-radius: var(--radius-pill);
		background: var(--color-divider, var(--color-stone-light));
		transition: background 200ms var(--ease-out-expo, ease-out);
		pointer-events: none;
	}
	.toggle::after {
		content: '';
		position: absolute;
		top: 10px;
		left: 7px;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--color-paper);
		box-shadow: var(--shadow-rest);
		transition: transform 200ms var(--ease-out-expo, ease-out);
		pointer-events: none;
	}
	.toggle[aria-checked='true']::before {
		background: var(--color-peach-deep);
	}
	.toggle[aria-checked='true']::after {
		transform: translateX(22px);
	}
	.toggle:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
	}
	@media (prefers-reduced-motion: reduce) {
		.toggle::before,
		.toggle::after,
		.live-dot {
			animation: none;
			transition: none;
		}
	}
	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.45;
		}
	}
</style>
