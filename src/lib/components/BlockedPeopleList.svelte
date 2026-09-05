<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';

	let {
		blocks
	}: {
		blocks: Array<{ blockedId: string; displayName: string; blockedAt: string }>;
	} = $props();

	let busyId = $state<string | null>(null);
	let statusMessage = $state('');
	let statusRole = $state<'status' | 'alert'>('status');
	let hiddenIds = $state<string[]>([]);

	const visibleBlocks = $derived(blocks.filter((entry) => !hiddenIds.includes(entry.blockedId)));

	async function unblock(blockedId: string, displayName: string): Promise<void> {
		busyId = blockedId;
		statusMessage = '';
		try {
			const response = await fetch(`/api/trust/blocks/${blockedId}`, {
				method: 'DELETE',
				credentials: 'same-origin'
			});
			const json = (await response.json()) as { error?: { message: string } };
			if (!response.ok) {
				statusRole = 'alert';
				statusMessage = json.error?.message ?? `Could not unblock ${displayName}.`;
				return;
			}
			hiddenIds = [...hiddenIds, blockedId];
			statusRole = 'status';
			statusMessage = `${displayName} unblocked. You can message each other again.`;
		} catch {
			statusRole = 'alert';
			statusMessage = `Could not unblock ${displayName}. Check your connection and try again.`;
		} finally {
			busyId = null;
		}
	}
</script>

<Card>
	{#if visibleBlocks.length === 0}
		<p class="body empty" data-testid="blocked-people-empty">
			You have not blocked anyone. Blocking stops new messages both ways and hides your profile from
			their search results. The other person is not notified.
		</p>
	{:else}
		<ul class="blocked-list" data-testid="blocked-people-list">
			{#each visibleBlocks as entry (entry.blockedId)}
				<li class="blocked-item">
					<div class="blocked-item__meta">
						<span class="blocked-item__name">{entry.displayName}</span>
						<span class="label blocked-item__date">
							Blocked {new Date(entry.blockedAt).toLocaleDateString()}
						</span>
					</div>
					<span data-testid={`unblock-${entry.blockedId}`}>
						<Button
							variant="secondary"
							disabled={busyId === entry.blockedId}
							onclick={() => void unblock(entry.blockedId, entry.displayName)}
						>
							{busyId === entry.blockedId ? 'Unblocking…' : 'Unblock'}
						</Button>
					</span>
				</li>
			{/each}
		</ul>
	{/if}
	{#if statusMessage}
		<p class="status label" role={statusRole} data-testid="blocked-people-status">
			{statusMessage}
		</p>
	{/if}
</Card>

<style>
	.empty {
		margin: 0;
		color: var(--color-stone);
	}
	.blocked-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-md);
	}
	.blocked-item {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-sm);
	}
	.blocked-item__meta {
		display: grid;
		gap: var(--space-xs);
		min-width: 0;
	}
	.blocked-item__name {
		font-weight: 600;
		color: var(--color-ink);
	}
	.blocked-item__date {
		color: var(--color-stone);
	}
	.status {
		margin: var(--space-md) 0 0;
		color: var(--color-stone);
	}
</style>
