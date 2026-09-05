<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import { REPORT_REASON_OPTIONS, type ReportReasonValue } from '$lib/safety/report-flow';

	let {
		busy = false,
		onSubmit
	}: {
		busy?: boolean;
		onSubmit?: (input: { reason: ReportReasonValue; freeText?: string }) => void | Promise<void>;
	} = $props();

	let localReason = $state<ReportReasonValue | null>(null);
	let localFreeText = $state('');
	let localShowFreeText = $state(false);

	async function chooseReason(reason: ReportReasonValue): Promise<void> {
		if (busy) return;
		localReason = reason;
		if (reason === 'other') {
			localShowFreeText = true;
			return;
		}
		localShowFreeText = false;
		await submit(reason);
	}

	async function submit(reason: ReportReasonValue): Promise<void> {
		if (busy) return;
		const payload: { reason: ReportReasonValue; freeText?: string } = { reason };
		if (reason === 'other' && localFreeText.trim()) {
			payload.freeText = localFreeText.trim();
		}
		await onSubmit?.(payload);
	}
</script>

<div class="report-form" data-testid="report-reason-form">
	<div class="report-form__reasons" role="group" aria-label="Report reason">
		{#each REPORT_REASON_OPTIONS as option (option.value)}
			<Button
				variant={localReason === option.value ? 'primary' : 'secondary'}
				disabled={busy}
				onclick={() => void chooseReason(option.value)}
			>
				{option.label}
			</Button>
		{/each}
	</div>

	{#if localShowFreeText}
		<label class="report-form__details" for="report-free-text">
			<span class="label">Tell us more (optional)</span>
			<textarea
				id="report-free-text"
				class="report-form__textarea"
				maxlength="2000"
				rows="4"
				bind:value={localFreeText}
				disabled={busy}
				data-testid="report-free-text"></textarea>
		</label>
		<span data-testid="report-submit">
			<Button disabled={busy} onclick={() => void submit('other')}>Submit report</Button>
		</span>
	{/if}
</div>

<style>
	.report-form {
		display: grid;
		gap: var(--space-md);
	}
	.report-form__reasons {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
	}
	.report-form :global(.btn) {
		font-size: 0.875rem;
		padding: 10px 18px;
		min-height: 44px;
	}
	.report-form__details {
		display: grid;
		gap: var(--space-xs);
	}
	.report-form__details .label {
		font-family: var(--font-label-family);
		font-size: var(--font-label-size);
		font-weight: var(--font-label-weight);
		color: var(--color-ink);
	}
	.report-form__textarea {
		background: var(--color-paper);
		border: 1px solid var(--color-stone);
		border-radius: var(--radius-md);
		padding: 16px var(--space-md);
		font-family: var(--font-body-family);
		font-size: var(--font-body-size);
		color: var(--color-ink);
		min-height: 120px;
		resize: vertical;
	}
	.report-form__textarea:focus {
		border: 2px solid var(--color-peach-deep);
		outline: none;
		box-shadow: 0 0 0 3px var(--color-focus-ring);
	}
	.report-form__textarea:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
