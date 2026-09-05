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

	$effect(() => {
		if (menuWasOpen && !menuOpen) {
			const reset = threadSafetyPanelStateAfterMenuClose();
			panelCopy = reset.panelCopy;
			blockConfirming = reset.blockConfirming;
			choosingReason = reset.choosingReason;
			busy = reset.busy;
			statusMessage = reset.statusMessage;
			statusRole = reset.statusRole;
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
					reason
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
				<Button variant="secondary" disabled={busy} onclick={() => void submitReport(option.value)}>
					{option.label}
				</Button>
			{/each}
		</div>
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
	.thread-safety-status {
		margin: var(--space-sm) 0 0;
		color: var(--color-stone);
	}
</style>
