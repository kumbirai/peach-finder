<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant = 'primary' | 'secondary' | 'ghost';

	let {
		variant = 'primary',
		type = 'button',
		disabled = false,
		href,
		form,
		onclick,
		messageDraftKey,
		ariaLabel,
		children
	}: {
		variant?: Variant;
		type?: 'button' | 'submit';
		disabled?: boolean;
		href?: string;
		form?: string;
		onclick?: (event: MouseEvent) => void;
		messageDraftKey?: string | undefined;
		ariaLabel?: string;
		children: Snippet;
	} = $props();
</script>

{#if href && messageDraftKey}
	<a
		class="btn btn-{variant}"
		{href}
		aria-disabled={disabled}
		aria-label={ariaLabel}
		data-message-draft-key={messageDraftKey}
	>
		{@render children()}
	</a>
{:else if href}
	<a class="btn btn-{variant}" {href} aria-disabled={disabled} aria-label={ariaLabel} {onclick}>
		{@render children()}
	</a>
{:else}
	<button class="btn btn-{variant}" {type} {disabled} {form} {onclick} aria-label={ariaLabel}>
		{@render children()}
	</button>
{/if}

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-title-family);
		font-size: var(--font-title-size);
		font-weight: var(--font-title-weight);
		line-height: var(--font-title-line-height);
		border-radius: var(--radius-pill);
		padding: 14px 28px;
		cursor: pointer;
		text-decoration: none;
		border: none;
		min-height: 44px;
		transition:
			background var(--motion-duration-fast) var(--motion-ease-out-expo),
			box-shadow var(--motion-duration-fast) var(--motion-ease-out-expo),
			transform var(--motion-duration-fast) var(--motion-ease-out-expo);
	}
	.btn:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
	}
	.btn:disabled,
	.btn[aria-disabled='true'] {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.btn-primary {
		background: var(--color-peach-deep);
		color: var(--color-paper);
	}
	.btn-primary:hover:not(:disabled) {
		background: var(--color-peach-deep-hover);
		box-shadow: var(--shadow-lift-hover);
		transform: translateY(-1px);
	}
	.btn-secondary {
		background: var(--color-paper);
		color: var(--color-pine);
		border: 1px solid var(--color-stone);
		padding: 13px 27px;
	}
	.btn-secondary:hover:not(:disabled) {
		background: var(--color-blush);
	}
	.btn-secondary:focus-visible {
		outline-color: var(--color-pine);
	}
	.btn-ghost {
		background: transparent;
		color: var(--color-ink);
		padding: 13px 20px;
	}
</style>
