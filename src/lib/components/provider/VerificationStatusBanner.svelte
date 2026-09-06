<script lang="ts">
	import type { VerificationOwnerStatus } from '$lib/server/modules/trust-and-safety/domain/verification-status';

	let {
		status,
		rejectionReason = null
	}: {
		status: VerificationOwnerStatus;
		rejectionReason?: string | null;
	} = $props();

	const copy = $derived.by(() => {
		switch (status) {
			case 'pending':
				return {
					className: 'pending',
					text: 'Your documents are under review. We will email you when there is an outcome — usually within 2–3 business days. Your profile stays live the whole time.'
				};
			case 'approved':
				return {
					className: 'approved',
					text: 'Your identity is verified. The badge appears on your public profile when seekers view it.'
				};
			case 'rejected':
				return {
					className: 'rejected',
					text: rejectionReason
						? `Your last submission was not approved: ${rejectionReason} You can upload new documents and submit again below.`
						: 'Your last submission was not approved. Upload new documents and submit again below.'
				};
			default:
				return {
					className: 'neutral',
					text: 'No submission yet. Submit your government ID photo and a selfie below to start review.'
				};
		}
	});
</script>

<div
	class="banner {copy.className}"
	data-testid="verification-status-banner"
	data-status={status}
	role="status"
>
	<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
		{#if status === 'approved'}
			<path
				d="M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		{:else}
			<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" />
			<path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
		{/if}
	</svg>
	<span>{copy.text}</span>
</div>

<style>
	.banner {
		display: flex;
		gap: var(--space-sm);
		align-items: flex-start;
		padding: var(--space-md);
		border-radius: 14px;
		font-size: 0.9375rem;
		line-height: 1.5;
	}
	.banner svg {
		flex-shrink: 0;
		margin-top: 2px;
	}
	.neutral,
	.pending {
		background: var(--color-blush);
		color: var(--color-ink);
	}
	.neutral svg,
	.pending svg {
		color: var(--color-peach-deep);
	}
	.approved {
		background: var(--color-blush);
		color: var(--color-pine);
	}
	.rejected {
		background: #f6e2da;
		color: var(--color-ink);
	}
	.rejected svg {
		color: var(--color-peach-deep);
	}
</style>
