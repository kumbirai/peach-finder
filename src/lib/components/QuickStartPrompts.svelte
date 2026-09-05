<script lang="ts">
	import {
		SEEKER_QUICK_START_PROMPTS,
		insertQuickStartText,
		type QuickStartPrompt
	} from '$lib/messaging/quick-start-prompts';

	let {
		composerText = '',
		onSelect,
		prompts = SEEKER_QUICK_START_PROMPTS
	}: {
		composerText?: string;
		onSelect: (nextText: string) => void;
		prompts?: readonly QuickStartPrompt[];
	} = $props();

	function selectPrompt(prompt: QuickStartPrompt): void {
		onSelect(insertQuickStartText(composerText, prompt.text));
	}
</script>

<div class="quick-replies" role="group" aria-label="Quick-start prompts">
	{#each prompts as prompt (prompt.text)}
		<button type="button" class="quick-reply" onclick={() => selectPrompt(prompt)}>
			{prompt.label}
		</button>
	{/each}
</div>

<style>
	.quick-replies {
		display: flex;
		gap: var(--space-sm);
		overflow-x: auto;
		padding-bottom: var(--space-sm);
		scrollbar-width: thin;
	}
	.quick-reply {
		flex-shrink: 0;
		background: var(--color-blush);
		color: var(--color-pine);
		border: none;
		border-radius: var(--radius-pill);
		padding: 8px 14px;
		font-family: var(--font-label-family);
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
		min-height: 44px;
		transition: background var(--motion-duration-fast) var(--motion-ease-out-expo);
	}
	.quick-reply:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
	}
	@media (prefers-reduced-motion: reduce) {
		.quick-reply {
			transition: none;
		}
	}
</style>
