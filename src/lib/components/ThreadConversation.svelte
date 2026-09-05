<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import MessageBubble from '$lib/components/MessageBubble.svelte';
	import { applyDeliveryUpdate } from '$lib/messaging/delivery-label';
	import { fetchThreadPoll } from '$lib/messaging/poll-client';
	import { latestMessageId, mergeThreadMessages } from '$lib/messaging/thread-messages';
	import { MessagingTransport } from '$lib/messaging/ws-transport';
	import type { ThreadMessage } from '$lib/messaging/types';

	let {
		threadId,
		viewerId,
		counterpartName,
		initialMessages,
		backHref = '/messages',
		forcePolling = false
	}: {
		threadId: string;
		viewerId: string;
		counterpartName: string;
		initialMessages: ThreadMessage[];
		backHref?: string;
		forcePolling?: boolean;
	} = $props();

	let messages = $state.raw<ThreadMessage[]>([...initialMessages]);
	let body = $state('');
	let sending = $state(false);
	let statusMessage = $state('');
	let connectionMode = $state<'websocket' | 'polling'>('websocket');
	let threadBodyEl: HTMLDivElement | undefined = $state();

	let transport: MessagingTransport | null = null;

	function scrollToBottom(): void {
		if (!threadBodyEl) return;
		threadBodyEl.scrollTop = threadBodyEl.scrollHeight;
	}

	async function markReadUpTo(messageId: string): Promise<void> {
		await fetch(`/api/messaging/threads/${threadId}/read`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			credentials: 'same-origin',
			body: JSON.stringify({ upToMessageId: messageId })
		});
	}

	function applyPollPayload(payload: {
		messages: ThreadMessage[];
		deliveredUpdates: Array<{ messageId: string; deliveredAt: string }>;
		readUpdates: Array<{ messageId: string; readAt: string }>;
	}): void {
		messages = mergeThreadMessages(messages, payload.messages);
		for (const update of payload.deliveredUpdates)
			applyDelivered(update.messageId, update.deliveredAt);
		for (const update of payload.readUpdates) applyRead(update.messageId);
		const latestInbound = payload.messages.filter((m) => m.sender.id !== viewerId).at(-1);
		if (latestInbound) void markReadUpTo(latestInbound.id);
		scrollToBottom();
	}

	async function hydrateInboundFromPoll(
		frame: Extract<import('$lib/messaging/types').WsServerMessage, { type: 'message.sent' }>
	): Promise<void> {
		const priorCursor = latestMessageId(
			messages.filter((m) => m.id !== frame.payload.messageId && !m.id.startsWith('optimistic-'))
		);
		const polled = await fetchThreadPoll(threadId, priorCursor);
		if (!polled) {
			messages = mergeThreadMessages(messages, [
				{
					id: frame.payload.messageId,
					threadId,
					body: frame.payload.bodyPreview,
					sentAt: frame.payload.sentAt,
					sender: { id: frame.payload.senderId, displayName: counterpartName },
					outboundDeliveryState: null,
					deliveredAt: null,
					readAt: null
				}
			]);
			transport?.ackMessageReceived(threadId, frame.payload.messageId);
			void markReadUpTo(frame.payload.messageId);
			scrollToBottom();
			return;
		}
		applyPollPayload(polled);
	}

	function applyDelivered(messageId: string, deliveredAt: string): void {
		messages = messages.map((message) => {
			if (message.id !== messageId || message.sender.id !== viewerId) return message;
			const next = { ...message };
			applyDeliveryUpdate(next, 'delivered', deliveredAt);
			return next;
		});
	}

	function applyRead(messageId: string): void {
		messages = messages.map((message) => {
			if (message.id !== messageId || message.sender.id !== viewerId) return message;
			const next = { ...message };
			applyDeliveryUpdate(next, 'read');
			return next;
		});
	}

	onMount(() => {
		transport = new MessagingTransport({
			onServerMessage: (frame) => {
				if (frame.type === 'message.sent' && frame.payload.threadId === threadId) {
					void hydrateInboundFromPoll(frame);
					return;
				}
				if (frame.type === 'message.delivered' && frame.payload.threadId === threadId) {
					applyDelivered(frame.payload.messageId, frame.payload.deliveredAt);
					return;
				}
				if (frame.type === 'message.read' && frame.payload.threadId === threadId) {
					applyRead(frame.payload.messageId);
				}
			},
			onPollMessages: ({ messages: polled, deliveredUpdates, readUpdates }) => {
				applyPollPayload({
					messages: polled as ThreadMessage[],
					deliveredUpdates,
					readUpdates
				});
			},
			onConnectionModeChange: (mode) => {
				connectionMode = mode;
			}
		});
		transport.setForcePolling(forcePolling);
		transport.start(threadId, latestMessageId(messages));
		const latestInbound = [...messages].reverse().find((m) => m.sender.id !== viewerId);
		if (latestInbound) void markReadUpTo(latestInbound.id);
		scrollToBottom();
	});

	onDestroy(() => transport?.stop());

	async function sendMessage(): Promise<void> {
		const trimmed = body.trim();
		if (!trimmed || sending) return;
		sending = true;
		statusMessage = '';

		const optimisticId = `optimistic-${Date.now()}`;
		const optimistic: ThreadMessage = {
			id: optimisticId,
			threadId,
			body: trimmed,
			sentAt: new Date().toISOString(),
			sender: { id: viewerId, displayName: 'You' },
			outboundDeliveryState: 'sent',
			deliveredAt: null,
			readAt: null
		};
		messages = [...messages, optimistic];
		body = '';
		scrollToBottom();

		try {
			const response = await fetch(`/api/messaging/threads/${threadId}/messages`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({ body: trimmed })
			});
			const json = (await response.json()) as {
				data?: { messageId: string };
				error?: { message: string };
			};
			if (!response.ok) {
				messages = messages.filter((m) => m.id !== optimisticId);
				statusMessage = json.error?.message ?? 'Could not send message.';
				body = trimmed;
				return;
			}
			messages = messages.map((message) =>
				message.id === optimisticId
					? { ...message, id: json.data?.messageId ?? message.id }
					: message
			);
		} catch {
			messages = messages.filter((m) => m.id !== optimisticId);
			statusMessage = 'Could not send message.';
			body = trimmed;
		} finally {
			sending = false;
		}
	}
</script>

<header class="thread-header">
	<Button href={backHref} variant="ghost">Back</Button>
	<div class="thread-header__details">
		<h1 class="thread-header__name">{counterpartName}</h1>
		<p class="connection label" aria-live="polite">
			{#if connectionMode === 'polling'}
				Reconnecting — messages still arrive, just a little slower.
			{:else}
				Live
			{/if}
		</p>
	</div>
</header>

<div class="thread-body" bind:this={threadBodyEl} aria-label="Conversation">
	{#each messages as message (message.id)}
		<MessageBubble {message} {viewerId} />
	{/each}
</div>

<form
	class="composer"
	onsubmit={(event) => {
		event.preventDefault();
		void sendMessage();
	}}
>
	<Input id="thread-composer" label="Write a message" name="body" bind:value={body} />
	<Button type="submit" variant="primary" disabled={sending}>
		{sending ? 'Sending…' : 'Send'}
	</Button>
</form>

{#if statusMessage}
	<p class="status label" role="alert">{statusMessage}</p>
{/if}

<style>
	.thread-header {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding-bottom: var(--space-md);
		border-bottom: 1px solid var(--color-divider);
	}
	.thread-header__details {
		flex: 1;
		min-width: 0;
	}
	.thread-header__name {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}
	.connection {
		margin: 0;
		color: var(--color-stone);
	}
	.thread-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		min-height: 40vh;
		max-height: 55vh;
		overflow-y: auto;
		padding: var(--space-md) 0;
	}
	.composer {
		display: grid;
		gap: var(--space-md);
		padding-top: var(--space-md);
		border-top: 1px solid var(--color-divider);
	}
	.status {
		color: var(--color-stone);
		margin: 0;
	}
</style>
