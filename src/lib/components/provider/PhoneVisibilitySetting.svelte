<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';

	let {
		phoneVisible
	}: {
		phoneVisible: boolean;
	} = $props();

	let visible = $state(untrack(() => phoneVisible));
	let saving = $state(false);
	let errorMessage = $state<string | null>(null);
	let savedMessage = $state<string | null>(null);
	let syncedPhoneVisible = untrack(() => phoneVisible);

	$effect(() => {
		if (phoneVisible !== syncedPhoneVisible) {
			visible = phoneVisible;
			syncedPhoneVisible = phoneVisible;
		}
	});

	async function persistToggle(next: boolean) {
		if (saving) return;

		const previous = !next;
		saving = true;
		errorMessage = null;
		savedMessage = null;

		try {
			const response = await fetch('/api/provider/profile/phone-visibility', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ visible: next })
			});

			if (!response.ok) {
				visible = previous;
				errorMessage = 'Could not save your phone visibility setting.';
				return;
			}

			visible = next;
			syncedPhoneVisible = next;
			savedMessage = next
				? 'Saved — visitors without an account can now call you from your profile.'
				: 'Saved — your number is hidden from visitors without an account.';
			await invalidateAll();
		} catch {
			visible = previous;
			errorMessage = 'Could not save your phone visibility setting.';
		} finally {
			saving = false;
		}
	}

	async function handleToggle() {
		if (saving) return;
		const next = !visible;
		visible = next;
		await persistToggle(next);
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		void handleToggle();
	}
</script>

<form class="phone-setting" onsubmit={handleSubmit}>
	<div class="row">
		<div class="copy">
			<p class="label setting-label" id="phone-visibility-label">
				Show my phone number to visitors without an account
			</p>
			<p class="body hint" id="phone-visibility-help">
				When on, anyone browsing Peach Finder can tap to call you from your profile. When off, only
				signed-in seekers see your number — visitors without an account never receive it in the page
				we serve.
			</p>
		</div>
		<button
			type="submit"
			class="toggle"
			role="switch"
			aria-checked={visible}
			aria-label="Show my phone number to visitors without an account"
			disabled={saving}
		></button>
	</div>
	{#if savedMessage}
		<p class="success label" role="status">{savedMessage}</p>
	{/if}
	{#if errorMessage}
		<p class="error label" role="alert">{errorMessage}</p>
	{/if}
</form>

<style>
	.phone-setting {
		display: grid;
		gap: var(--space-sm);
	}
	.row {
		display: flex;
		gap: var(--space-md);
		align-items: flex-start;
		justify-content: space-between;
	}
	.copy {
		display: grid;
		gap: var(--space-xs);
		flex: 1;
		min-width: 0;
	}
	.setting-label {
		margin: 0;
		font-weight: 600;
		color: var(--color-ink);
	}
	.hint {
		margin: 0;
		color: var(--color-stone);
	}
	.success {
		margin: 0;
		color: var(--color-pine);
	}
	.error {
		margin: 0;
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
