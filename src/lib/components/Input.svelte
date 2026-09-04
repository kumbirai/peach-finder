<script lang="ts">
	let {
		id,
		label,
		name,
		value = $bindable(''),
		type = 'text',
		placeholder = '',
		error = '',
		disabled = false,
		autocomplete
	}: {
		id: string;
		label: string;
		name: string;
		value?: string;
		type?: 'text' | 'email' | 'password' | 'search' | 'tel';
		placeholder?: string;
		error?: string;
		disabled?: boolean;
		autocomplete?:
			'on' | 'off' | 'name' | 'email' | 'username' | 'tel' | 'current-password' | 'new-password';
	} = $props();
</script>

<div class="field">
	<label class="label" for={id}>{label}</label>
	<input
		class="input"
		class:input-error={Boolean(error)}
		{id}
		{name}
		{type}
		{placeholder}
		{disabled}
		{autocomplete}
		bind:value
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={error ? `${id}-error` : undefined}
	/>
	{#if error}
		<p class="error" id={`${id}-error`}>{error}</p>
	{/if}
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}
	.label {
		font-family: var(--font-label-family);
		font-size: var(--font-label-size);
		font-weight: var(--font-label-weight);
		letter-spacing: var(--font-label-letter-spacing);
		color: var(--color-ink);
	}
	.input {
		background: var(--color-paper);
		border: 1px solid var(--color-stone);
		border-radius: var(--radius-md);
		padding: 16px var(--space-md);
		font-family: var(--font-body-family);
		font-size: var(--font-body-size);
		color: var(--color-ink);
		min-height: 48px;
	}
	.input:focus {
		border: 2px solid var(--color-peach-deep);
		outline: none;
		box-shadow: 0 0 0 3px var(--color-focus-ring);
	}
	.input-error {
		border-color: var(--color-error);
	}
	.input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.error {
		margin: 0;
		color: var(--color-error);
		font-size: var(--font-label-size);
	}
</style>
