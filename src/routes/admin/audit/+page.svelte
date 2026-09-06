<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';

	let { data } = $props();

	type AuditEntry = (typeof data.entries)[number];

	let entries = $state<AuditEntry[]>([]);
	let nextCursor = $state<string | null>(null);
	let loadingMore = $state(false);
	let loadError = $state<string | null>(null);
	let targetType = $state('');

	$effect(() => {
		entries = [...data.entries];
		nextCursor = data.nextCursor;
		targetType = data.targetType || '';
		loadError = null;
		loadingMore = false;
	});

	function formatWhen(iso: string): string {
		return new Date(iso).toLocaleString('en-ZA', {
			dateStyle: 'medium',
			timeStyle: 'short',
			timeZone: 'UTC'
		});
	}

	function actorLine(entry: AuditEntry): string {
		if (entry.actorId) {
			return `${entry.actorDisplayName} (${entry.actorRole})`;
		}
		return entry.actorDisplayName;
	}

	async function loadOlder(): Promise<void> {
		if (!nextCursor || loadingMore) return;
		loadingMore = true;
		loadError = null;
		try {
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local request-builder, never stored in reactive state
			const params = new URLSearchParams({
				targetType: data.targetType,
				targetId: data.targetId
			});
			params.set('cursor', nextCursor);
			const limit = new URL(window.location.href).searchParams.get('limit');
			if (limit) params.set('limit', limit);

			const response = await fetch(`/admin/api/audit?${params.toString()}`);
			if (!response.ok) {
				loadError = 'Could not load older entries. Try again.';
				return;
			}

			const body = (await response.json()) as {
				data: AuditEntry[];
				meta?: { nextCursor?: string | null };
			};
			entries = [...entries, ...body.data];
			nextCursor = body.meta?.nextCursor ?? null;
		} catch {
			loadError = 'Could not load older entries. Try again.';
		} finally {
			loadingMore = false;
		}
	}
</script>

<main class="admin-panel admin-panel--top" data-testid="admin-audit-log">
	<h1 class="headline">Audit log</h1>
	<p class="body intro">
		Read-only history of who did what, to whom, when, and why. Entries are append-only — no
		application path can edit or delete them.
	</p>

	<form class="audit-filters" method="GET" action="/admin/audit" role="search">
		<div class="filter-field">
			<label class="filter-label" for="audit-target-type">Target type</label>
			<select
				id="audit-target-type"
				name="targetType"
				class="filter-select"
				bind:value={targetType}
				required
			>
				<option value="" disabled>Choose a target type</option>
				{#each data.targetTypeOptions as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>
		<Input
			id="audit-target-id"
			name="targetId"
			label="Target ID"
			type="text"
			placeholder="UUID of the target entity"
			value={data.targetId}
			autocomplete="off"
		/>
		<div class="filter-actions">
			<Button type="submit" variant="secondary">View audit trail</Button>
		</div>
	</form>

	{#if data.needsFilters}
		<p class="body admin-empty">Enter a target type and ID to load the audit trail.</p>
	{:else if data.invalidFilters}
		<p class="body admin-empty" data-testid="audit-log-invalid-filters" role="alert">
			Enter a valid target ID (UUID) to load the audit trail.
		</p>
	{:else if entries.length === 0}
		<p class="body admin-empty" data-testid="audit-log-empty">
			No audit entries for {data.targetType} · {data.targetId}.
		</p>
	{:else}
		<div class="audit-list" data-testid="audit-log-results">
			{#each entries as entry (entry.id)}
				<article class="audit-row" data-testid="audit-log-entry" data-audit-id={entry.id}>
					<div class="audit-row__top">
						<div>
							<div class="audit-row__action">{entry.action}</div>
							<div class="audit-row__when">{formatWhen(entry.occurredAt)} UTC</div>
						</div>
						<span class="status-chip">{entry.actorRole}</span>
					</div>
					<dl class="audit-facts">
						<dt>Who</dt>
						<dd data-testid="audit-actor">{actorLine(entry)}</dd>
						<dt>What</dt>
						<dd>{entry.action}</dd>
						<dt>Whom</dt>
						<dd>{entry.targetType} · {entry.targetId}</dd>
						<dt>When</dt>
						<dd>{formatWhen(entry.occurredAt)} UTC</dd>
						<dt>Reason</dt>
						<dd data-testid="audit-reason">{entry.reason ?? '—'}</dd>
					</dl>
				</article>
			{/each}
		</div>

		{#if nextCursor}
			<div class="load-more">
				<button
					type="button"
					class="load-more__link"
					data-testid="audit-log-load-more"
					disabled={loadingMore}
					onclick={loadOlder}
				>
					{loadingMore ? 'Loading older entries…' : 'Load older entries'}
				</button>
			</div>
		{/if}
		{#if loadError}
			<p class="body admin-empty" role="alert">{loadError}</p>
		{/if}
	{/if}

	<p class="verify-copy verify-copy--spaced">
		Audit entries are written by the owning module in the same transaction as each admin action.
		This viewer cannot modify history.
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

	.audit-filters {
		margin-top: var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		max-width: 28rem;
	}

	.filter-field {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	.filter-label {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-ink);
	}

	.filter-select {
		min-height: 44px;
		padding: 12px 16px;
		border-radius: 14px;
		border: 1px solid var(--color-divider);
		background: var(--color-paper);
		font-family: var(--font-body-family);
		font-size: 1rem;
		color: var(--color-ink);
	}

	.filter-select:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
	}

	.filter-actions {
		display: flex;
		gap: var(--space-sm);
	}

	.admin-empty {
		margin-top: var(--space-md);
	}

	.audit-list {
		margin-top: var(--space-lg);
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.audit-row {
		background: var(--color-paper);
		border-radius: var(--radius-md);
		padding: var(--space-md);
		box-shadow: var(--shadow-rest);
	}

	.audit-row__top {
		display: flex;
		justify-content: space-between;
		gap: var(--space-md);
		align-items: flex-start;
	}

	.audit-row__action {
		font-weight: 700;
	}

	.audit-row__when {
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

	.audit-facts {
		margin: var(--space-md) 0 0;
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-xs) var(--space-md);
		font-size: 0.875rem;
	}

	.audit-facts dt {
		font-weight: 700;
		color: var(--color-stone);
	}

	.audit-facts dd {
		margin: 0;
		color: var(--color-ink);
		word-break: break-word;
	}

	.load-more {
		margin-top: var(--space-md);
	}

	.load-more__link {
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
		text-decoration: none;
		cursor: pointer;
	}

	.load-more__link:disabled {
		opacity: 0.7;
		cursor: wait;
	}

	.load-more__link:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
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
