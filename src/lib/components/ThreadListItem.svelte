<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import UnreadBadge from '$lib/components/UnreadBadge.svelte';
	import { formatThreadActivityTime } from '$lib/messaging/format-thread-time';

	let {
		threadId,
		counterpartName,
		lastMessagePreview,
		lastActivityAt,
		unreadCount
	}: {
		threadId: string;
		counterpartName: string;
		lastMessagePreview: string;
		lastActivityAt: string;
		unreadCount: number;
	} = $props();

	const activityLabel = $derived(formatThreadActivityTime(lastActivityAt));
	const isUnread = $derived(unreadCount > 0);
</script>

<li>
	<a
		class="thread-link"
		class:unread={isUnread}
		href="/messages/{threadId}"
		data-testid="thread-list-item"
	>
		<Card>
			<div class="row">
				<p class="label counterpart">{counterpartName}</p>
				<time class="time label" datetime={lastActivityAt}>{activityLabel}</time>
			</div>
			<div class="row preview-row">
				<p class="body preview">{lastMessagePreview}</p>
				{#if isUnread}
					<UnreadBadge count={unreadCount} label="unread messages" />
				{/if}
			</div>
		</Card>
	</a>
</li>

<style>
	.row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--space-sm);
	}
	.preview-row {
		align-items: center;
		margin-top: var(--space-xs);
	}
	.counterpart {
		margin: 0;
		color: var(--color-ink);
		font-weight: 600;
		min-width: 0;
	}
	.time {
		margin: 0;
		color: var(--color-stone);
		flex-shrink: 0;
	}
	.preview {
		margin: 0;
		color: var(--color-stone);
		flex: 1;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.thread-link {
		display: block;
		color: inherit;
		text-decoration: none;
		border-radius: var(--radius-card);
	}
	.thread-link:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
	}
	.thread-link.unread .counterpart {
		color: var(--color-ink);
	}
	.thread-link.unread .preview {
		color: var(--color-ink);
		font-weight: 500;
	}
</style>
