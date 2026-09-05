<script lang="ts">
	import { deliveryStateLabel } from '$lib/messaging/delivery-label';
	import type { ThreadMessage } from '$lib/messaging/types';

	let {
		message,
		viewerId
	}: {
		message: ThreadMessage;
		viewerId: string;
	} = $props();

	const isMine = $derived(message.sender.id === viewerId);
	const deliveryLabel = $derived(
		message.outboundDeliveryState ? deliveryStateLabel(message.outboundDeliveryState) : null
	);
</script>

<div
	class="bubble"
	class:mine={isMine}
	class:theirs={!isMine}
	data-testid={isMine ? 'message-bubble-outbound' : 'message-bubble-inbound'}
>
	<p class="body">{message.body}</p>
	<div class="meta">
		<time class="bubble-time" datetime={message.sentAt}>
			{new Date(message.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
		</time>
		{#if deliveryLabel}
			<span class="delivery label" data-testid="message-delivery-state" aria-live="polite">
				{deliveryLabel}
			</span>
		{/if}
	</div>
</div>

<style>
	.bubble {
		max-width: 75%;
		padding: 10px 16px;
		border-radius: var(--radius-card-nested);
		font-size: 0.9375rem;
		line-height: 1.4;
	}
	.bubble.theirs {
		align-self: flex-start;
		background: var(--color-paper);
		border: 1px solid var(--color-divider);
		border-bottom-left-radius: 4px;
		box-shadow: var(--shadow-card);
	}
	.bubble.mine {
		align-self: flex-end;
		background: var(--color-peach-deep);
		color: var(--color-paper);
		border-bottom-right-radius: 4px;
	}
	.body {
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.meta {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		margin-top: 2px;
	}
	.bubble-time {
		font-size: 0.6875rem;
		color: var(--color-stone);
	}
	.bubble.mine .bubble-time,
	.bubble.mine .delivery {
		color: var(--color-paper);
	}
</style>
