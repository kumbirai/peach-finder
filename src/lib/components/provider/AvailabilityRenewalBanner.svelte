<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';

	let {
		notification,
		formAction = '?/renewAvailability'
	}: {
		notification: {
			id: string;
			title: string;
			body: string;
		};
		formAction?: string;
	} = $props();

	let saving = $state(false);
</script>

<aside class="renewal-banner" aria-live="polite" data-testid="availability-renewal-banner">
	<div class="copy">
		<p class="title label">{notification.title}</p>
		<p class="body">{notification.body}</p>
	</div>
	<form
		method="POST"
		action={formAction}
		use:enhance={() => {
			saving = true;
			return async ({ result, update }) => {
				try {
					if (result.type === 'failure') return;
					await update();
				} finally {
					saving = false;
				}
			};
		}}
	>
		<input type="hidden" name="notificationId" value={notification.id} />
		<Button variant="primary" type="submit" disabled={saving}>
			<span data-testid="still-available-button">Still available</span>
		</Button>
	</form>
</aside>

<style>
	.renewal-banner {
		display: grid;
		gap: var(--space-md);
		background: var(--color-paper);
		border-radius: var(--radius-lg);
		padding: var(--space-lg);
		box-shadow: var(--shadow-rest);
		border-left: 4px solid var(--color-peach-deep);
	}
	.copy {
		display: grid;
		gap: var(--space-xs);
	}
	.title {
		margin: 0;
		color: var(--color-peach-deep);
		font-weight: 700;
	}
	.body {
		margin: 0;
		color: var(--color-stone);
	}
</style>
