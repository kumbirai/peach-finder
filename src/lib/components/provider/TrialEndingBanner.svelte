<script lang="ts">
	let {
		notification
	}: {
		notification: {
			title: string;
			body: string;
		};
	} = $props();
</script>

<aside
	class="trial-ending-banner"
	aria-live="polite"
	data-testid="trial-ending-notification-banner"
>
	<p class="title label">{notification.title}</p>
	<p class="body">{notification.body}</p>
</aside>

<style>
	.trial-ending-banner {
		display: grid;
		gap: var(--space-xs);
		background: var(--color-paper);
		border-radius: var(--radius-lg);
		padding: var(--space-lg);
		box-shadow: var(--shadow-rest);
		border-left: 4px solid var(--color-peach-deep);
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
