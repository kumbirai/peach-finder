<script lang="ts">
	import Card from '$lib/components/Card.svelte';

	type InAppNotification = {
		id: string;
		category: string;
		title: string;
		body: string;
		deepLinkPath: string;
		createdAt: string;
	};

	let {
		notifications
	}: {
		notifications: InAppNotification[];
	} = $props();
</script>

<section class="in-app-notifications" aria-labelledby="in-app-notifications-heading">
	<h2 id="in-app-notifications-heading" class="title">Recent notifications</h2>
	{#if notifications.length === 0}
		<Card>
			<p class="body empty" data-testid="in-app-notifications-empty">
				No unread notifications. New messages and account updates appear here until you read them.
			</p>
		</Card>
	{:else}
		<ul class="notification-list" data-testid="in-app-notifications-list">
			{#each notifications as notification (notification.id)}
				<li>
					<Card href={notification.deepLinkPath}>
						<article
							class="notification-item"
							data-testid={`in-app-notification-${notification.id}`}
						>
							<p class="notification-title label">{notification.title}</p>
							<p class="notification-body body">{notification.body}</p>
							<time class="notification-time" datetime={notification.createdAt}>
								{new Date(notification.createdAt).toLocaleString()}
							</time>
						</article>
					</Card>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.in-app-notifications {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.title {
		font-family: var(--font-sans);
		font-size: var(--text-title-size);
		font-weight: var(--text-title-weight);
		line-height: var(--text-title-leading);
		color: var(--color-ink);
		margin: 0;
	}

	.notification-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.notification-item {
		padding: var(--space-4);
	}

	.notification-title {
		margin: 0 0 var(--space-1);
		color: var(--color-ink);
	}

	.notification-body {
		margin: 0 0 var(--space-2);
		color: var(--color-ink-muted);
	}

	.notification-time {
		display: block;
		font-size: var(--text-label-size);
		line-height: var(--text-label-leading);
		color: var(--color-ink-muted);
	}

	.empty {
		margin: 0;
		padding: var(--space-4);
		color: var(--color-ink-muted);
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.notification-list .card) {
			transition: none;
		}
	}
</style>
