<script lang="ts">
	import type { RecentSearchEntry } from '$lib/recent-searches';
	import { hrefForRecentSearch } from '$lib/recent-searches';

	let {
		entries = [],
		onRemove,
		onClearAll
	}: {
		entries?: RecentSearchEntry[];
		onRemove?: (id: string) => void;
		onClearAll?: () => void;
	} = $props();
</script>

{#if entries.length > 0}
	<section class="recent-searches" data-testid="recent-searches" aria-label="Recent searches">
		<div class="recent-searches-header">
			<h2 class="recent-searches-title">Recent searches</h2>
			<button
				type="button"
				class="clear-all"
				data-testid="recent-searches-clear-all"
				onclick={() => onClearAll?.()}
			>
				Clear all
			</button>
		</div>
		<ul class="recent-searches-list">
			{#each entries as entry (entry.id)}
				<li class="recent-search-item" data-testid="recent-search-item">
					<a
						class="recent-search-link"
						href={hrefForRecentSearch(entry)}
						data-testid="recent-search-rerun"
					>
						<span class="recent-search-label">{entry.label}</span>
					</a>
					<button
						type="button"
						class="recent-search-clear"
						data-testid="recent-search-clear"
						aria-label={`Remove ${entry.label} from recent searches`}
						onclick={() => onRemove?.(entry.id)}
					>
						Remove
					</button>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.recent-searches {
		display: grid;
		gap: var(--space-sm);
	}
	.recent-searches-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-md);
	}
	.recent-searches-title {
		margin: 0;
		font-family: var(--font-body-family);
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-ink);
	}
	.clear-all {
		background: transparent;
		border: none;
		color: var(--color-peach-deep);
		font-family: var(--font-body-family);
		font-size: var(--font-body-size);
		font-weight: 600;
		min-height: 44px;
		padding: 0 var(--space-sm);
		cursor: pointer;
		border-radius: var(--radius-pill);
	}
	.clear-all:focus-visible {
		outline: none;
		box-shadow: 0 0 0 3px var(--color-focus-ring);
	}
	.recent-searches-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
	}
	.recent-search-item {
		display: inline-flex;
		align-items: stretch;
		max-width: 100%;
		border: 1px solid var(--color-stone);
		border-radius: var(--radius-pill);
		background: var(--color-paper);
		box-shadow: var(--shadow-ambient-rest);
		overflow: hidden;
	}
	.recent-search-link {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 var(--space-md);
		color: var(--color-ink);
		text-decoration: none;
		font-family: var(--font-body-family);
		font-size: var(--font-body-size);
		font-weight: 500;
	}
	.recent-search-link:focus-visible {
		outline: none;
		box-shadow: inset 0 0 0 3px var(--color-focus-ring);
	}
	.recent-search-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 16rem;
	}
	.recent-search-clear {
		border: none;
		border-left: 1px solid var(--color-divider);
		background: transparent;
		color: var(--color-stone);
		font-family: var(--font-label-family);
		font-size: var(--font-label-size);
		font-weight: var(--font-label-weight);
		letter-spacing: var(--font-label-letter-spacing);
		text-transform: uppercase;
		min-height: 44px;
		min-width: 44px;
		padding: 0 var(--space-sm);
		cursor: pointer;
	}
	.recent-search-clear:focus-visible {
		outline: none;
		box-shadow: inset 0 0 0 3px var(--color-focus-ring);
	}
	@media (prefers-reduced-motion: reduce) {
		.recent-search-item {
			box-shadow: none;
		}
	}
</style>
