<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';

	let { data, form } = $props();

	let action = $state('unpublish');
	let targetId = $state('');
	let reason = $state('');
	let removeReplyOnly = $state(false);

	const targetLabel = $derived.by(() => {
		switch (action) {
			case 'remove_photo':
				return 'Photo ID';
			case 'remove_review':
				return 'Review ID';
			case 'unpublish':
			case 'revoke_badge':
				return 'Provider profile ID';
			case 'suspend':
			case 'reinstate':
				return 'User ID';
			default:
				return 'Target ID';
		}
	});

	const actionNote = $derived.by(() => {
		switch (action) {
			case 'unpublish':
				return 'Unpublishes the profile. The provider may edit and republish themselves — republish is not admin-gated.';
			case 'suspend':
				return 'Revokes account access and hides the profile. Sessions end immediately.';
			case 'reinstate':
				return 'Restores account access. The provider must log in again; republish is their own action.';
			case 'revoke_badge':
				return 'Clears the identity verified badge. Profile visibility is unaffected.';
			case 'remove_photo':
				return 'Removes one photo from the provider gallery.';
			case 'remove_review':
				return 'Removes a review or, when flagged, only the provider reply.';
			default:
				return 'Each action requires a recorded reason and notifies the affected party.';
		}
	});
</script>

<main class="admin-panel admin-panel--top" data-testid="admin-moderation-panel">
	<h1 class="headline">Moderation actions</h1>
	<p class="body intro">
		Remove photo/review, unpublish, suspend, reinstate, and revoke badge — each with a recorded
		reason shared with the affected party.
	</p>

	{#if form?.message}
		<p class="form-message" role="alert">{form.message}</p>
	{/if}
	{#if form?.success}
		<p class="form-success" role="status">Moderation action recorded.</p>
	{/if}

	<form
		class="moderation-form"
		method="POST"
		action="?/moderate"
		use:enhance={() => {
			return async ({ update }) => {
				await update();
			};
		}}
	>
		<label class="field-label" for="moderation-action">Action</label>
		<select id="moderation-action" name="action" class="field-select" bind:value={action}>
			{#each data.actions as item (item.value)}
				<option value={item.value}>{item.label}</option>
			{/each}
		</select>

		<Input
			id="moderation-target"
			name="targetId"
			label={targetLabel}
			placeholder="UUID of the target"
			bind:value={targetId}
		/>

		{#if action === 'remove_review'}
			<label class="checkbox-row">
				<input type="checkbox" name="part" value="reply" bind:checked={removeReplyOnly} />
				Remove provider reply only
			</label>
		{/if}

		<p class="verify-copy admin-inline-note">{actionNote}</p>

		<Input
			id="moderation-reason"
			name="reason"
			label="Reason"
			placeholder="Required — shared with the affected party"
			bind:value={reason}
		/>

		<div class="form-actions">
			<Button type="submit" variant="secondary">Record action</Button>
		</div>
	</form>
</main>

<style>
	.admin-panel {
		padding: 0 var(--space-lg) var(--space-xl);
	}

	.admin-panel--top {
		padding-top: var(--space-lg);
	}

	.headline {
		font-family: var(--font-display-family);
		font-size: var(--font-headline-size);
	}

	.body {
		margin-top: var(--space-sm);
		color: var(--color-stone);
	}

	.intro {
		max-width: 40rem;
	}

	.moderation-form {
		margin-top: var(--space-lg);
		max-width: 28rem;
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		background: var(--color-paper);
		border-radius: var(--radius-md);
		padding: var(--space-md);
		box-shadow: var(--shadow-rest);
	}

	.field-label {
		font-size: 0.8125rem;
		font-weight: 700;
		color: var(--color-stone);
	}

	.field-select {
		border-radius: 14px;
		border: 1px solid var(--color-divider);
		padding: 12px 16px;
		min-height: 44px;
		font: inherit;
		background: var(--color-paper);
	}

	.field-select:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
	}

	.checkbox-row {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		font-size: 0.9375rem;
		min-height: 44px;
	}

	.checkbox-row input {
		width: 1.125rem;
		height: 1.125rem;
	}

	.admin-inline-note {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--color-stone);
	}

	.form-actions {
		display: flex;
		gap: var(--space-sm);
		flex-wrap: wrap;
	}

	.form-message {
		color: var(--color-error);
		margin: var(--space-sm) 0;
	}

	.form-success {
		color: var(--color-pine);
		margin: var(--space-sm) 0;
		font-weight: 600;
	}
</style>
