<script lang="ts">
	import { goto } from '$app/navigation';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { suggestKindLabel } from '$lib/suggest-kind-label';
	import type { Suggestion } from '$lib/types/discovery';

	const SUGGEST_DEBOUNCE_MS = 50;

	let {
		id = 'search',
		name = 'q',
		value = '',
		placeholder = 'Deep tissue, speaks Zulu, available now…',
		label = 'Search therapists',
		disabled = false,
		onSearch
	}: {
		id?: string;
		name?: string;
		value?: string;
		placeholder?: string;
		label?: string;
		disabled?: boolean;
		onSearch?: (query: string) => void | Promise<void>;
	} = $props();

	// svelte-ignore state_referenced_locally -- intentional: seed the editable query from the initial prop value
	let query = $state(value);
	let suggestions = $state<Suggestion[]>([]);
	let loading = $state(false);
	let open = $state(false);
	let activeIndex = $state(-1);
	const listboxId = $derived(`${id}-suggestions`);
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let abortController: AbortController | undefined;

	function closeList() {
		open = false;
		activeIndex = -1;
	}

	async function fetchSuggestions(prefix: string) {
		const q = prefix.trim();
		if (!q) {
			suggestions = [];
			loading = false;
			closeList();
			return;
		}

		abortController?.abort();
		abortController = new AbortController();
		loading = true;
		open = true;

		try {
			const res = await fetch(`/api/discovery/suggest?q=${encodeURIComponent(q)}`, {
				signal: abortController.signal
			});
			if (!res.ok) {
				suggestions = [];
				return;
			}
			const body = (await res.json()) as { data: Suggestion[] };
			suggestions = body.data ?? [];
			open = suggestions.length > 0 || loading;
			activeIndex = suggestions.length > 0 ? 0 : -1;
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return;
			suggestions = [];
		} finally {
			loading = false;
			if (suggestions.length === 0 && !loading) closeList();
		}
	}

	function scheduleFetch(next: string) {
		clearTimeout(debounceTimer);
		const trimmed = next.trim();
		if (!trimmed) {
			abortController?.abort();
			suggestions = [];
			loading = false;
			closeList();
			return;
		}
		abortController?.abort();
		suggestions = [];
		activeIndex = -1;
		loading = true;
		open = true;
		debounceTimer = setTimeout(() => {
			void fetchSuggestions(next);
		}, SUGGEST_DEBOUNCE_MS);
	}

	function onInput(event: Event) {
		const next = (event.currentTarget as HTMLInputElement).value;
		query = next;
		scheduleFetch(next);
	}

	async function navigateToQuery(next: string) {
		const trimmed = next.trim();
		closeList();
		if (onSearch) {
			await onSearch(trimmed);
			return;
		}
		if (!trimmed) {
			await goto('/');
			return;
		}
		await goto(`/?q=${encodeURIComponent(trimmed)}`);
	}

	async function selectSuggestion(suggestion: Suggestion) {
		query = suggestion.term;
		await navigateToQuery(suggestion.term);
	}

	async function onSubmit(event: SubmitEvent) {
		event.preventDefault();
		clearTimeout(debounceTimer);
		abortController?.abort();
		await navigateToQuery(query);
	}

	function onKeydown(event: KeyboardEvent) {
		if (!open || suggestions.length === 0) {
			if (event.key === 'Escape') closeList();
			return;
		}

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				activeIndex = (activeIndex + 1) % suggestions.length;
				break;
			case 'ArrowUp':
				event.preventDefault();
				activeIndex = activeIndex <= 0 ? suggestions.length - 1 : activeIndex - 1;
				break;
			case 'Enter':
				if (activeIndex >= 0) {
					const selected = suggestions[activeIndex];
					if (selected) {
						event.preventDefault();
						void selectSuggestion(selected);
					}
				}
				break;
			case 'Escape':
				event.preventDefault();
				closeList();
				break;
		}
	}

	function onBlur(event: FocusEvent) {
		const next = event.relatedTarget as Node | null;
		const root = (event.currentTarget as HTMLElement).closest('.search-bar-root');
		if (next && root?.contains(next)) return;
		closeList();
	}
</script>

<div class="search-bar-root">
	<form class="search-form" onsubmit={onSubmit}>
		<div class="search-bar" class:search-bar--open={open}>
			<svg
				class="search-icon"
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				aria-hidden="true"
			>
				<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" />
				<path d="M20 20L16.5 16.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
			</svg>
			<label class="visually-hidden" for={id}>{label}</label>
			<input
				{id}
				{name}
				class="search-input"
				type="search"
				{placeholder}
				{disabled}
				autocomplete="off"
				role="combobox"
				aria-autocomplete="list"
				aria-expanded={open}
				aria-controls={open ? listboxId : undefined}
				aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
				bind:value={query}
				oninput={onInput}
				onkeydown={onKeydown}
				onblur={onBlur}
			/>
		</div>
		<button class="submit-button" type="submit" {disabled}>Search</button>
	</form>

	{#if open}
		<div class="suggestions-panel" data-testid="search-suggestions-panel">
			{#if loading && suggestions.length === 0}
				<div class="suggestions-skeleton" aria-hidden="true">
					<Skeleton lines={3} />
				</div>
			{:else}
				<ul id={listboxId} class="suggestions-list" role="listbox" aria-label="Search suggestions">
					{#each suggestions as suggestion, index (suggestion.term + suggestion.kind)}
						<li role="presentation">
							<button
								type="button"
								id={`${id}-option-${index}`}
								class="suggestion"
								class:suggestion--active={index === activeIndex}
								role="option"
								aria-selected={index === activeIndex}
								data-testid="search-suggestion"
								data-suggestion-kind={suggestion.kind}
								onmousedown={(event) => event.preventDefault()}
								onclick={() => void selectSuggestion(suggestion)}
							>
								<span class="suggestion-term">{suggestion.term}</span>
								<span class="suggestion-kind">{suggestKindLabel(suggestion.kind)}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>

<style>
	.search-bar-root {
		position: relative;
	}
	.search-form {
		display: grid;
		gap: var(--space-md);
	}
	.search-bar {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		background: var(--color-paper);
		border: 1px solid var(--color-stone);
		border-radius: var(--radius-pill);
		padding: 4px var(--space-md);
		min-height: 48px;
		color: var(--color-stone);
	}
	.search-bar:focus-within {
		border-color: var(--color-peach-deep);
		box-shadow: 0 0 0 3px var(--color-focus-ring);
	}
	.search-bar--open {
		border-bottom-left-radius: var(--radius-md);
		border-bottom-right-radius: var(--radius-md);
	}
	.search-icon {
		flex-shrink: 0;
	}
	.search-input {
		border: none;
		outline: none;
		background: transparent;
		font-family: var(--font-body-family);
		font-size: var(--font-body-size);
		color: var(--color-ink);
		width: 100%;
		min-height: 44px;
	}
	.search-input::placeholder {
		color: var(--color-stone);
	}
	.search-input:focus {
		outline: none;
	}
	.submit-button {
		justify-self: start;
		background: var(--color-peach-deep);
		color: var(--color-paper);
		border: none;
		border-radius: var(--radius-pill);
		padding: 0.75rem 1.5rem;
		min-height: 44px;
		font-family: var(--font-body-family);
		font-weight: 600;
		cursor: pointer;
		box-shadow: var(--shadow-ambient-rest);
	}
	.submit-button:focus-visible {
		outline: none;
		box-shadow:
			var(--shadow-ambient-rest),
			0 0 0 3px var(--color-focus-ring);
	}
	.submit-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.suggestions-panel {
		position: absolute;
		top: calc(100% + var(--space-xs));
		left: 0;
		right: 0;
		z-index: 20;
		background: var(--color-paper);
		border: 1px solid var(--color-stone);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-ambient-lift);
		overflow: hidden;
	}
	.suggestions-skeleton {
		padding: var(--space-md);
	}
	.suggestions-list {
		list-style: none;
		margin: 0;
		padding: var(--space-xs);
		display: grid;
		gap: 2px;
	}
	.suggestion {
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
		font-size: var(--font-body-size);
		text-align: left;
		cursor: pointer;
	}
	.suggestion:hover,
	.suggestion--active {
		background: var(--color-blush);
	}
	.suggestion:focus-visible {
		outline: none;
		box-shadow: 0 0 0 3px var(--color-focus-ring);
	}
	.suggestion-term {
		font-weight: 500;
	}
	.suggestion-kind {
		font-family: var(--font-label-family);
		font-size: var(--font-label-size);
		font-weight: var(--font-label-weight);
		letter-spacing: var(--font-label-letter-spacing);
		color: var(--color-stone);
		text-transform: uppercase;
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
	@media (prefers-reduced-motion: reduce) {
		.search-bar:focus-within {
			box-shadow: none;
			border-width: 2px;
		}
	}
</style>
