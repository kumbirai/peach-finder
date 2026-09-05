<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import ThreadConversation from '$lib/components/ThreadConversation.svelte';
	import type { ThreadMessage } from '$lib/messaging/types';

	let {
		data
	}: {
		data: {
			threadId: string;
			viewerId: string;
			counterpartName: string;
			messages: ThreadMessage[];
			forcePolling: boolean;
			backHref: string;
			viewerRole: 'seeker' | 'provider';
		};
	} = $props();
</script>

<svelte:head>
	<title>{data.counterpartName} — Peach Finder</title>
</svelte:head>

{#if data.viewerRole === 'seeker'}
	<Navigation current="messages" />
{/if}

<main class="page">
	<ThreadConversation
		threadId={data.threadId}
		viewerId={data.viewerId}
		counterpartName={data.counterpartName}
		initialMessages={data.messages}
		backHref={data.backHref}
		forcePolling={data.forcePolling}
		showQuickStartPrompts={data.viewerRole === 'seeker'}
	/>
</main>

<style>
	.page {
		max-width: 40rem;
		margin: 0 auto;
		padding: var(--space-xl) var(--space-md);
		padding-bottom: 5rem;
	}
</style>
