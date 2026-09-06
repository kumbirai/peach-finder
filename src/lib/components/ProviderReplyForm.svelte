<script lang="ts">
	import Button from '$lib/components/Button.svelte';

	let {
		busy = false,
		initialBody = '',
		submitLabel = 'Publish reply',
		busyLabel = 'Publishing…',
		onSubmit
	}: {
		busy?: boolean;
		initialBody?: string;
		submitLabel?: string;
		busyLabel?: string;
		onSubmit: (input: { body: string }) => Promise<void>;
	} = $props();

	let body = $state('');
	let errorMessage = $state('');

	$effect(() => {
		body = initialBody;
	});

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		errorMessage = '';
		const trimmed = body.trim();
		if (!trimmed) {
			errorMessage = 'Write a short reply before publishing.';
			return;
		}
		if (trimmed.length > 1000) {
			errorMessage = 'Keep your reply to 1000 characters or fewer.';
			return;
		}
		await onSubmit({ body: trimmed });
	}
</script>

<form class="reply-form" onsubmit={handleSubmit} data-testid="provider-reply-form">
	<label class="label" for="providerReplyBody">Your reply</label>
	<textarea
		id="providerReplyBody"
		name="body"
		class="body-input"
		rows="4"
		maxlength="1000"
		placeholder="Share your side of the story — one public reply per review."
		bind:value={body}
		disabled={busy}></textarea>

	{#if errorMessage}
		<p class="error label" role="alert">{errorMessage}</p>
	{/if}

	<Button type="submit" variant="primary" disabled={busy}>
		{busy ? busyLabel : submitLabel}
	</Button>
</form>

<style>
	.reply-form {
		display: grid;
		gap: var(--space-md);
	}
	.body-input {
		background: var(--color-paper);
		border: 1px solid var(--color-stone);
		border-radius: var(--radius-md);
		padding: 16px var(--space-md);
		font-family: var(--font-body-family);
		font-size: var(--font-body-size);
		color: var(--color-ink);
		min-height: 96px;
		resize: vertical;
	}
	.body-input:focus {
		border: 2px solid var(--color-peach-deep);
		outline: none;
		box-shadow: 0 0 0 3px var(--color-focus-ring);
	}
	.error {
		margin: 0;
		color: var(--color-peach-deep);
	}
</style>
