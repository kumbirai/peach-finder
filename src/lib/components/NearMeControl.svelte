<script lang="ts">
	import type { Suggestion } from '$lib/types/discovery';
	import { suggestKindLabel } from '$lib/suggest-kind-label';

	export type ProximityState = {
		near: boolean;
		lat: number | null;
		lng: number | null;
		areaSlug: string | null;
	};

	type ManualFallbackReason = 'denied' | 'unavailable';

	let {
		proximityLabel = null,
		orphanProximity = false,
		clearProximityHref = '/',
		onProximityChange
	}: {
		proximityLabel?: string | null;
		orphanProximity?: boolean;
		clearProximityHref?: string;
		onProximityChange?: (state: ProximityState) => void | Promise<void>;
	} = $props();

	let requesting = $state(false);
	let manualFallbackReason = $state<ManualFallbackReason | null>(null);
	let areaQuery = $state('');
	let areaSuggestions = $state<Suggestion[]>([]);
	let areaLoading = $state(false);
	let areaOpen = $state(false);
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	// Match server-resolved proximity only — URL params alone can carry an unresolved area slug.
	const hasProximity = $derived(Boolean(proximityLabel));
	const statusLabel = $derived(proximityLabel);

	async function emit(state: ProximityState) {
		await onProximityChange?.(state);
	}

	const manualFallbackHint = $derived(
		manualFallbackReason === 'unavailable'
			? 'Location is unavailable in this browser. Enter your area to sort results by distance.'
			: 'Location access was denied. Enter your area to sort results by distance.'
	);

	async function requestDeviceLocation() {
		if (!navigator.geolocation) {
			manualFallbackReason = 'unavailable';
			return;
		}
		requesting = true;
		manualFallbackReason = null;
		try {
			const position = await new Promise<GeolocationPosition>((resolve, reject) => {
				navigator.geolocation.getCurrentPosition(resolve, reject, {
					enableHighAccuracy: false,
					timeout: 10_000,
					maximumAge: 60_000
				});
			});
			await emit({
				near: true,
				lat: position.coords.latitude,
				lng: position.coords.longitude,
				areaSlug: null
			});
		} catch {
			manualFallbackReason = 'denied';
		} finally {
			requesting = false;
		}
	}

	async function fetchAreaSuggestions(prefix: string) {
		const q = prefix.trim();
		if (!q) {
			areaSuggestions = [];
			areaLoading = false;
			areaOpen = false;
			return;
		}
		areaLoading = true;
		areaOpen = true;
		try {
			const res = await fetch(`/api/discovery/suggest?q=${encodeURIComponent(q)}`);
			if (!res.ok) {
				areaSuggestions = [];
				return;
			}
			const body = (await res.json()) as { data: Suggestion[] };
			areaSuggestions = (body.data ?? []).filter((item) => item.kind === 'area');
		} catch {
			areaSuggestions = [];
		} finally {
			areaLoading = false;
		}
	}

	function scheduleAreaFetch(next: string) {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			void fetchAreaSuggestions(next);
		}, 50);
	}

	function onAreaInput(event: Event) {
		const next = (event.currentTarget as HTMLInputElement).value;
		areaQuery = next;
		scheduleAreaFetch(next);
	}

	async function selectArea(suggestion: Suggestion) {
		areaQuery = suggestion.term;
		areaOpen = false;
		areaSuggestions = [];
		manualFallbackReason = null;
		await emit({
			near: true,
			lat: null,
			lng: null,
			areaSlug: suggestion.term
		});
	}

	async function onAreaSubmit(event: SubmitEvent) {
		event.preventDefault();
		const match = areaSuggestions[0];
		if (match) await selectArea(match);
	}
</script>

<div class="near-me" data-testid="near-me-control">
	{#if hasProximity && statusLabel}
		<div class="location-row" aria-live="polite" data-testid="proximity-active">
			<svg
				class="location-icon"
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				aria-hidden="true"
			>
				<path
					d="M12 21s-7-6.1-7-11a7 7 0 1 1 14 0c0 4.9-7 11-7 11z"
					stroke="currentColor"
					stroke-width="2"
				/>
				<circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="2" />
			</svg>
			<span data-testid="proximity-status">{statusLabel}</span>
			<a class="clear-link" data-testid="proximity-clear" href={clearProximityHref}>Clear</a>
		</div>
	{:else if manualFallbackReason}
		<div class="manual-area" data-testid="manual-area-entry">
			<p class="manual-area__hint">{manualFallbackHint}</p>
			<form class="manual-area__form" onsubmit={onAreaSubmit}>
				<label class="visually-hidden" for="manual-area-input">Your area</label>
				<input
					id="manual-area-input"
					class="manual-area__input"
					type="search"
					role="combobox"
					placeholder="e.g. Rosebank"
					autocomplete="off"
					bind:value={areaQuery}
					oninput={onAreaInput}
					aria-expanded={areaOpen}
					aria-controls="manual-area-suggestions"
				/>
				{#if areaOpen}
					<ul id="manual-area-suggestions" class="manual-area__suggestions" role="listbox">
						{#if areaLoading && areaSuggestions.length === 0}
							<li class="manual-area__loading" aria-hidden="true">Searching areas…</li>
						{:else}
							{#each areaSuggestions as suggestion (suggestion.term)}
								<li role="presentation">
									<button
										type="button"
										class="manual-area__option"
										role="option"
										aria-selected={false}
										onmousedown={(event) => event.preventDefault()}
										onclick={() => void selectArea(suggestion)}
									>
										<span>{suggestion.term}</span>
										<span class="manual-area__kind">{suggestKindLabel(suggestion.kind)}</span>
									</button>
								</li>
							{/each}
						{/if}
					</ul>
				{/if}
			</form>
		</div>
	{:else}
		<div class="location-row">
			<button
				type="button"
				class="near-me-button"
				data-testid="near-me-button"
				disabled={requesting}
				onclick={() => void requestDeviceLocation()}
			>
				<svg
					class="location-icon"
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
				>
					<path
						d="M12 21s-7-6.1-7-11a7 7 0 1 1 14 0c0 4.9-7 11-7 11z"
						stroke="currentColor"
						stroke-width="2"
					/>
					<circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="2" />
				</svg>
				{requesting ? 'Locating…' : 'Near me'}
			</button>
			{#if orphanProximity}
				<a class="clear-link" data-testid="orphan-proximity-clear" href={clearProximityHref}>
					Clear
				</a>
			{/if}
		</div>
	{/if}
</div>

<style>
	.near-me {
		display: grid;
		gap: var(--space-sm);
	}
	.location-row {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--color-stone);
		font-size: 0.8125rem;
		font-weight: 600;
		letter-spacing: 0.02em;
	}
	.location-icon {
		flex-shrink: 0;
		color: var(--color-pine);
	}
	.near-me-button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		border: none;
		background: transparent;
		color: var(--color-stone);
		font: inherit;
		font-weight: 600;
		letter-spacing: 0.02em;
		padding: 0;
		min-height: 44px;
		cursor: pointer;
	}
	.near-me-button:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
		border-radius: var(--radius-sm);
	}
	.near-me-button:disabled {
		opacity: 0.6;
		cursor: wait;
	}
	.clear-link {
		margin-left: auto;
		border: none;
		background: transparent;
		color: var(--color-peach-deep);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		min-height: 44px;
		padding: 0 var(--space-sm);
		text-decoration: none;
		display: inline-flex;
		align-items: center;
	}
	.clear-link:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
	}
	.manual-area {
		display: grid;
		gap: var(--space-sm);
	}
	.manual-area__hint {
		margin: 0;
		color: var(--color-stone);
		font-size: 0.875rem;
	}
	.manual-area__form {
		position: relative;
	}
	.manual-area__input {
		width: 100%;
		border: 1px solid var(--color-stone);
		border-radius: 14px;
		padding: 0.75rem 1rem;
		min-height: 44px;
		font-family: var(--font-body-family);
		font-size: var(--font-body-size);
		color: var(--color-ink);
		background: var(--color-paper);
	}
	.manual-area__input:focus {
		outline: none;
		border-color: var(--color-peach-deep);
		box-shadow: 0 0 0 3px var(--color-focus-ring);
	}
	.manual-area__suggestions {
		position: absolute;
		top: calc(100% + var(--space-xs));
		left: 0;
		right: 0;
		z-index: 20;
		list-style: none;
		margin: 0;
		padding: var(--space-xs);
		background: var(--color-paper);
		border: 1px solid var(--color-stone);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-ambient-lift);
		display: grid;
		gap: 2px;
	}
	.manual-area__option {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-md);
		width: 100%;
		min-height: 44px;
		padding: var(--space-sm) var(--space-md);
		border: none;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--color-ink);
		font-family: var(--font-body-family);
		text-align: left;
		cursor: pointer;
	}
	.manual-area__option:hover,
	.manual-area__option:focus-visible {
		background: var(--color-blush);
		outline: none;
		box-shadow: 0 0 0 3px var(--color-focus-ring);
	}
	.manual-area__kind {
		font-family: var(--font-label-family);
		font-size: var(--font-label-size);
		color: var(--color-stone);
		text-transform: uppercase;
	}
	.manual-area__loading {
		padding: var(--space-sm) var(--space-md);
		color: var(--color-stone);
		font-size: 0.875rem;
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
