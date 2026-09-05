<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import QuickStartPrompts from '$lib/components/QuickStartPrompts.svelte';

	const DRAFT_KEY = (id: string) => `pf_message_draft_${id}`;

	let {
		data,
		form
	}: {
		data: {
			providerProfileId: string;
			providerName: string;
			emailVerified: boolean;
			draft: string;
			thread: {
				threadId: string;
				messages: Array<{ id: string; body: string; sentAt: string; senderId: string }>;
			} | null;
			verificationToken: string | null;
		};
		form?: { held?: true; sent?: true; message?: string };
	} = $props();

	let body = $state(data.draft ?? '');
	let status = $state<'idle' | 'sending' | 'held' | 'sent' | 'error'>('idle');
	let statusMessage = $state('');

	function handleSubmit() {
		status = 'sending';
	}

	$effect(() => {
		if (data.draft) body = data.draft;
	});

	$effect(() => {
		if (form?.held) {
			status = 'held';
			statusMessage =
				'Verify your email to deliver this message. We will send it automatically once you confirm.';
			if (typeof sessionStorage !== 'undefined') {
				sessionStorage.removeItem(DRAFT_KEY(data.providerProfileId));
			}
		} else if (form?.sent) {
			status = 'sent';
			statusMessage = 'Message sent.';
		} else if (form?.message) {
			status = 'error';
			statusMessage = form.message;
		}
	});

	$effect(() => {
		if (typeof sessionStorage === 'undefined' || !body.trim()) return;
		sessionStorage.setItem(DRAFT_KEY(data.providerProfileId), body);
	});
</script>

<svelte:head>
	<title>Message {data.providerName} — Peach Finder</title>
</svelte:head>

<Navigation current="messages" />

<main class="page">
	<h1 class="headline">Message {data.providerName}</h1>

	{#if !data.emailVerified && !form?.held && status !== 'held'}
		<p class="banner label" role="status">
			Verify your email before your first message sends. It will be held safely until then.
		</p>
		{#if data.verificationToken}
			<Button href="/verify-email?token={data.verificationToken}" variant="secondary">
				Verify email now
			</Button>
		{/if}
	{/if}

	{#if data.thread?.messages.length}
		<ul class="messages" aria-label="Conversation">
			{#each data.thread.messages as msg (msg.id)}
				<li class="message">{msg.body}</li>
			{/each}
		</ul>
	{/if}

	<QuickStartPrompts
		composerText={body}
		onSelect={(nextText) => {
			body = nextText;
		}}
	/>

	<form class="composer" method="POST" action="?/send" onsubmit={handleSubmit}>
		<Input id="message-body" label="Your message" name="body" bind:value={body} />
		<Button type="submit" variant="primary" disabled={status === 'sending'}>
			{status === 'sending' ? 'Sending…' : 'Send message'}
		</Button>
	</form>

	{#if form?.held}
		<p class="status label" role="status">
			Verify your email to deliver this message. We will send it automatically once you confirm.
		</p>
	{:else if statusMessage}
		<p class="status label" role="status">{statusMessage}</p>
	{/if}
</main>

<style>
	.page {
		max-width: 40rem;
		margin: 0 auto;
		padding: var(--space-xl) var(--space-md);
		display: grid;
		gap: var(--space-lg);
		padding-bottom: 5rem;
	}
	.banner {
		background: var(--color-blush);
		padding: var(--space-md);
		border-radius: var(--radius-card);
		margin: 0;
	}
	.messages {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-sm);
	}
	.message {
		background: var(--color-paper);
		padding: var(--space-md);
		border-radius: var(--radius-card-nested);
		box-shadow: var(--shadow-card);
	}
	.composer {
		display: grid;
		gap: var(--space-md);
	}
	.status {
		color: var(--color-stone);
		margin: 0;
	}
</style>
