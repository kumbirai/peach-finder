<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import {
		THREAD_BLOCK_CONFIRM_COPY,
		THREAD_BLOCK_SUCCESS_COPY,
		THREAD_REPORT_SUCCESS_COPY,
		THREAD_SAFETY_INTRO,
		THREAD_SAFETY_REASON_OPTIONS,
		threadSafetyPanelStateAfterMenuClose,
		type ThreadSafetyReason
	} from '$lib/messaging/thread-safety';

	let {
		threadId,
		counterpartUserId,
		counterpartName,
		panelId,
		menuOpen = false
	}: {
		threadId: string;
		counterpartUserId: string;
		counterpartName: string;
		panelId: string;
		menuOpen?: boolean;
	} = $props();

	let panelCopy = $state(THREAD_SAFETY_INTRO);
	let blockConfirming = $state(false);
	let choosingReason = $state(false);
	let busy = $state(false);
	let statusMessage = $state('');
	let statusRole = $state<'status' | 'alert'>('status');
	let menuWasOpen = $state(false);
	let selectedReason = $state<ThreadSafetyReason | null>(null);
	let freeText = $state('');

	$effect(() => {
		if (menuWasOpen && !menuOpen) {
			const reset = threadSafetyPanelStateAfterMenuClose();
			panelCopy = reset.panelCopy;
			blockConfirming = reset.blockConfirming;
			choosingReason = reset.choosingReason;
			busy = reset.busy;
			statusMessage = reset.statusMessage;
			statusRole = reset.statusRole;
			selectedReason = null;
			freeText = '';
		}
		menuWasOpen = menuOpen;
	});

	async function submitReport(reason: ThreadSafetyReason): Promise<void> {
		busy = true;
		statusMessage = '';
		try {
			const response = await fetch('/api/trust/reports', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({
					targetType: 'thread',
					targetId: threadId,
					reason,
					freeText: reason === 'other' && freeText.trim() ? freeText.trim() : undefined
				})
			});
			const json = (await response.json()) as { error?: { message: string } };
			if (!response.ok) {
				statusRole = 'alert';
				statusMessage = json.error?.message ?? 'Could not send report.';
				return;
			}
			panelCopy = THREAD_REPORT_SUCCESS_COPY;
			choosingReason = false;
			selectedReason = null;
			freeText = '';
		} catch {
			statusRole = 'alert';
			statusMessage = 'Could not send report.';
		} finally {
			busy = false;
		}
	}

	async function submitBlock(): Promise<void> {
		if (!blockConfirming) {
			panelCopy = THREAD_BLOCK_CONFIRM_COPY;
			blockConfirming = true;
			return;
		}

		busy = true;
		statusMessage = '';
		try {
			const response = await fetch('/api/trust/blocks', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({ blockedId: counterpartUserId })
			});
			const json = (await response.json()) as { error?: { message: string } };
			if (!response.ok) {
				statusRole = 'alert';
				statusMessage = json.error?.message ?? 'Could not block this person.';
				return;
			}
			panelCopy = THREAD_BLOCK_SUCCESS_COPY;
			blockConfirming = false;
			choosingReason = false;
		} catch {
			statusRole = 'alert';
			statusMessage = 'Could not block this person.';
		} finally {
			busy = false;
		}
	}
</script>

<div id={panelId} class="thread-safety" data-testid="thread-safety-panel">
	<p>{panelCopy}</p>
	{#if choosingReason}
		<div class="thread-safety__reasons" role="group" aria-label="Report reason">
			{#each THREAD_SAFETY_REASON_OPTIONS as option (option.value)}
				<Button
					variant={selectedReason === option.value ? 'primary' : 'secondary'}
					disabled={busy}
					onclick={() => {
						selectedReason = option.value;
						if (option.value !== 'other') {
							void submitReport(option.value);
						}
					}}
				>
					{option.label}
				</Button>
			{/each}
		</div>
		{#if selectedReason === 'other'}
			<label class="thread-safety__details" for="{panelId}-free-text">
				<span class="label">Tell us more (optional)</span>
				<textarea
					id="{panelId}-free-text"
					class="thread-safety__textarea"
					maxlength="2000"
					rows="3"
					bind:value={freeText}
					disabled={busy}
					data-testid="thread-report-free-text"></textarea>
			</label>
			<span data-testid="thread-report-submit">
				<Button variant="secondary" disabled={busy} onclick={() => void submitReport('other')}>
					Submit report
				</Button>
			</span>
		{/if}
	{:else if !blockConfirming && panelCopy === THREAD_SAFETY_INTRO}
		<span data-testid="thread-safety-report">
			<Button
				variant="secondary"
				disabled={busy}
				onclick={() => {
					choosingReason = true;
				}}
			>
				Report
			</Button>
		</span>
		<span data-testid="thread-safety-block">
			<Button variant="ghost" disabled={busy} onclick={() => void submitBlock()}>
				Block {counterpartName.split(' ')[0]}
			</Button>
		</span>
	{:else if blockConfirming}
		<Button variant="ghost" disabled={busy} onclick={() => void submitBlock()}>
			Confirm block
		</Button>
	{/if}
</div>

{#if statusMessage}
	<p class="thread-safety-status label" role={statusRole}>{statusMessage}</p>
{/if}

<style>
	.thread-safety {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		flex-wrap: wrap;
		background: var(--color-blush);
		border-radius: var(--radius-md);
	}
	.thread-safety p {
		flex: 1 1 220px;
		color: var(--color-stone);
		font-size: 0.875rem;
		margin: 0;
	}
	.thread-safety :global(.btn) {
		font-size: 0.875rem;
		padding: 10px 18px;
		min-height: 44px;
	}
	.thread-safety__reasons {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
		width: 100%;
	}
	.thread-safety__details {
		display: grid;
		gap: var(--space-xs);
		width: 100%;
	}
	.thread-safety__details .label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-ink);
	}
	.thread-safety__textarea {
		background: var(--color-paper);
		border: 1px solid var(--color-stone);
		border-radius: var(--radius-md);
		padding: 12px var(--space-md);
		font-family: var(--font-body-family);
		font-size: 0.875rem;
		color: var(--color-ink);
		min-height: 88px;
		resize: vertical;
	}
	.thread-safety__textarea:focus {
		border: 2px solid var(--color-peach-deep);
		outline: none;
		box-shadow: 0 0 0 3px var(--color-focus-ring);
	}
	.thread-safety-status {
		margin: var(--space-sm) 0 0;
		color: var(--color-stone);
	}
</style>
