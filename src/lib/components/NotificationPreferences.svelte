<script lang="ts">
	import Card from '$lib/components/Card.svelte';

	type PreferenceChannel = {
		id: string;
		label: string;
		enabled: boolean;
		mutable: boolean;
	};

	type PreferenceCategory = {
		id: string;
		label: string;
		description: string;
		essential: boolean;
		channels: PreferenceChannel[];
	};

	let {
		preferences
	}: {
		preferences: { categories: PreferenceCategory[] };
	} = $props();

	let categories = $state<PreferenceCategory[]>([]);
	let savingKey = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);
	let savedMessage = $state<string | null>(null);
	let syncedParentCategories = $state<PreferenceCategory[] | null>(null);

	$effect(() => {
		if (savingKey !== null) return;
		const incoming = preferences.categories;
		if (incoming === syncedParentCategories) return;
		categories = structuredClone(incoming) as PreferenceCategory[];
		syncedParentCategories = incoming;
	});

	function toggleKey(categoryId: string, channelId: string): string {
		return `${categoryId}:${channelId}`;
	}

	function findChannel(categoryId: string, channelId: string): PreferenceChannel | undefined {
		return categories
			.find((category) => category.id === categoryId)
			?.channels.find((channel) => channel.id === channelId);
	}

	function setChannelEnabled(categoryId: string, channelId: string, enabled: boolean) {
		categories = categories.map((category) =>
			category.id !== categoryId
				? category
				: {
						...category,
						channels: category.channels.map((channel) =>
							channel.id === channelId ? { ...channel, enabled } : channel
						)
					}
		);
	}

	async function persistToggle(categoryId: string, channelId: string, next: boolean) {
		const key = toggleKey(categoryId, channelId);
		if (savingKey) return;

		const channel = findChannel(categoryId, channelId);
		if (!channel || !channel.mutable) return;

		const previous = channel.enabled;
		setChannelEnabled(categoryId, channelId, next);
		savingKey = key;
		errorMessage = null;
		savedMessage = null;

		try {
			const response = await fetch('/api/notifications/preferences', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					updates: [{ category: categoryId, channel: channelId, enabled: next }]
				})
			});

			if (!response.ok) {
				setChannelEnabled(categoryId, channelId, previous);
				const body = (await response.json()) as { error?: { message?: string } };
				errorMessage = body.error?.message ?? 'Could not save your notification setting.';
				return;
			}

			const body = (await response.json()) as {
				data: { categories: PreferenceCategory[] };
			};
			categories = structuredClone(body.data.categories);
			syncedParentCategories = preferences.categories;
			savedMessage = 'Notification preferences saved.';
		} catch {
			setChannelEnabled(categoryId, channelId, previous);
			errorMessage = 'Could not save your notification setting.';
		} finally {
			savingKey = null;
		}
	}

	async function handleToggle(categoryId: string, channelId: string) {
		const channel = findChannel(categoryId, channelId);
		if (!channel || !channel.mutable || savingKey) return;
		await persistToggle(categoryId, channelId, !channel.enabled);
	}

	function handleSubmit(event: SubmitEvent, categoryId: string, channelId: string) {
		event.preventDefault();
		void handleToggle(categoryId, channelId);
	}
</script>

<section class="notifications" aria-labelledby="notifications-heading">
	<h2 id="notifications-heading" class="title">Notifications</h2>
	<Card>
		<p class="body hint">
			Choose how Peach Finder reaches you. Billing, security, and moderation notices always deliver
			— you cannot silence consequences.
		</p>

		{#each categories as category (category.id)}
			<article class="category" aria-labelledby={`category-${category.id}`}>
				<div class="category-copy">
					<h3 id={`category-${category.id}`} class="label category-label">{category.label}</h3>
					<p class="body category-description">{category.description}</p>
					{#if category.essential}
						<p class="always-on label" role="status">Always delivered</p>
					{/if}
				</div>

				<div class="channel-list">
					{#each category.channels as channel (`${category.id}-${channel.id}`)}
						<form
							class="channel-row"
							onsubmit={(event) => handleSubmit(event, category.id, channel.id)}
						>
							<div class="channel-copy">
								<p class="label channel-label" id={`${category.id}-${channel.id}-label`}>
									{channel.label}
								</p>
								{#if !channel.mutable}
									<p class="body channel-note">On — cannot be turned off</p>
								{/if}
							</div>
							<button
								type="submit"
								class="toggle"
								role="switch"
								aria-checked={channel.enabled}
								aria-labelledby={`${category.id}-${channel.id}-label`}
								disabled={!channel.mutable || savingKey === toggleKey(category.id, channel.id)}
								data-testid={`notif-toggle-${category.id}-${channel.id}`}
							></button>
						</form>
					{/each}
				</div>
			</article>
		{/each}

		{#if savedMessage}
			<p class="success label" role="status">{savedMessage}</p>
		{/if}
		{#if errorMessage}
			<p class="error label" role="alert">{errorMessage}</p>
		{/if}
	</Card>
</section>

<style>
	.notifications {
		display: grid;
		gap: var(--space-md);
	}
	.hint {
		margin: 0 0 var(--space-lg);
		color: var(--color-stone);
	}
	.category {
		display: grid;
		gap: var(--space-md);
		padding-block: var(--space-md);
		border-top: 1px solid var(--color-divider, var(--color-stone-light));
	}
	.category:first-of-type {
		border-top: none;
		padding-top: 0;
	}
	.category-copy {
		display: grid;
		gap: var(--space-xs);
	}
	.category-label {
		margin: 0;
		font-weight: 600;
		color: var(--color-ink);
	}
	.category-description {
		margin: 0;
		color: var(--color-stone);
	}
	.always-on {
		margin: 0;
		color: var(--color-pine);
	}
	.channel-list {
		display: grid;
		gap: var(--space-sm);
	}
	.channel-row {
		display: flex;
		gap: var(--space-md);
		align-items: flex-start;
		justify-content: space-between;
		margin: 0;
	}
	.channel-copy {
		display: grid;
		gap: var(--space-xs);
		flex: 1;
		min-width: 0;
	}
	.channel-label {
		margin: 0;
		color: var(--color-ink);
	}
	.channel-note {
		margin: 0;
		color: var(--color-stone);
	}
	.success {
		margin: var(--space-md) 0 0;
		color: var(--color-pine);
	}
	.error {
		margin: var(--space-md) 0 0;
		color: var(--color-peach-deep);
	}
	.toggle {
		position: relative;
		width: 60px;
		height: 44px;
		border-radius: var(--radius-pill);
		cursor: pointer;
		flex-shrink: 0;
		border: none;
		background: transparent;
		padding: 0;
	}
	.toggle:disabled {
		cursor: wait;
		opacity: 0.7;
	}
	.toggle::before {
		content: '';
		position: absolute;
		top: 7px;
		left: 4px;
		width: 52px;
		height: 30px;
		border-radius: var(--radius-pill);
		background: var(--color-divider, var(--color-stone-light));
		transition: background 200ms var(--ease-out-expo, ease-out);
		pointer-events: none;
	}
	.toggle::after {
		content: '';
		position: absolute;
		top: 10px;
		left: 7px;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--color-paper);
		box-shadow: var(--shadow-rest);
		transition: transform 200ms var(--ease-out-expo, ease-out);
		pointer-events: none;
	}
	.toggle[aria-checked='true']::before {
		background: var(--color-peach-deep);
	}
	.toggle[aria-checked='true']::after {
		transform: translateX(22px);
	}
	.toggle:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
	}
	@media (prefers-reduced-motion: reduce) {
		.toggle::before,
		.toggle::after {
			transition: none;
		}
	}
</style>
