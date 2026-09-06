<script lang="ts">
	import { goto } from '$app/navigation';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import ListingBillingStatus from '$lib/components/provider/ListingBillingStatus.svelte';

	let {
		data
	}: {
		data: {
			billing: {
				dashboard: {
					headline: string;
					stateChipLabel: string;
					trialEndsAt: string | null;
					graceEndsAt: string | null;
					endDateLabel: string | null;
					endDatePrefix: string | null;
					whatHappensNext: string;
				} | null;
				paymentMethod: {
					onFile: boolean;
					cardLast4: string | null;
					cardBrand: string | null;
				};
				canCancelRenewal: boolean;
				cancelAtPeriodEnd: boolean;
				currentPeriodEndsLabel: string | null;
				featuringPriceCents: number;
				state: string;
				featuring: {
					active: boolean;
					cancelAtPeriodEnd: boolean;
					currentPeriodEndsLabel: string | null;
					canPurchase: boolean;
					canCancelRenewal: boolean;
				};
			} | null;
			price: {
				listing: { amountLabel: string };
				featuring: { amountLabel: string };
			} | null;
			history: Array<{
				id: string;
				lineItemLabel: string;
				amountLabel: string;
				statusLabel: string;
				issuedAt: string;
				paidAt: string | null;
				pspInvoiceRef: string | null;
			}>;
			notice: string | null;
		};
	} = $props();

	function noticeMessage(code: string | null): string | null {
		if (code === 'republish') {
			return 'Payment received — your profile is republished instantly.';
		}
		if (code === 'paid') {
			return 'Payment received — your listing billing is up to date.';
		}
		return null;
	}

	let paymentBusy = $state(false);
	let cancelBusy = $state(false);
	let payBusy = $state(false);
	let featuringBusy = $state(false);
	let featuringCancelBusy = $state(false);
	let actionError = $state<string | null>(null);
	let actionMessage = $state<string | null>(null);

	async function addPaymentMethod() {
		actionError = null;
		actionMessage = null;
		paymentBusy = true;
		try {
			const res = await fetch('/api/billing/payment-method', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					returnUrl: `${window.location.origin}/provider/billing?payment=complete`
				})
			});
			const body = await res.json();
			if (!res.ok) {
				actionError = body?.error?.message ?? 'Could not start secure card capture.';
				return;
			}
			const url = body?.data?.authorizationUrl as string | undefined;
			if (!url) {
				actionError = 'Could not start secure card capture.';
				return;
			}
			window.location.href = url;
		} catch {
			actionError = 'Could not start secure card capture. Check your connection and try again.';
		} finally {
			paymentBusy = false;
		}
	}

	async function cancelRenewal() {
		actionError = null;
		actionMessage = null;
		cancelBusy = true;
		try {
			const res = await fetch('/api/billing/subscription/cancel-renewal', { method: 'POST' });
			const body = await res.json();
			if (!res.ok) {
				actionError = body?.error?.message ?? 'Could not cancel renewal.';
				return;
			}
			actionMessage =
				'Renewal cancelled. Your listing stays live until the end of your current paid period.';
			await goto('/provider/billing', { invalidateAll: true });
		} catch {
			actionError = 'Could not cancel renewal. Check your connection and try again.';
		} finally {
			cancelBusy = false;
		}
	}

	async function payForListing() {
		actionError = null;
		actionMessage = null;
		payBusy = true;
		const wasUnpublished = data.billing?.state === 'unpublished';
		try {
			const res = await fetch('/api/billing/subscription/pay', { method: 'POST' });
			const body = await res.json();
			if (!res.ok) {
				actionError = body?.error?.message ?? 'Could not start listing payment.';
				return;
			}

			actionMessage = wasUnpublished
				? 'Payment received — your profile is republished instantly.'
				: 'Payment received — your listing billing is up to date.';
			await goto(`/provider/billing?notice=${wasUnpublished ? 'republish' : 'paid'}`, {
				invalidateAll: true,
				replaceState: true
			});
		} catch {
			actionError = 'Could not complete listing payment. Check your connection and try again.';
		} finally {
			payBusy = false;
		}
	}

	async function buyFeaturing() {
		actionError = null;
		actionMessage = null;
		featuringBusy = true;
		try {
			const res = await fetch('/api/billing/featuring', { method: 'POST' });
			const body = await res.json();
			if (!res.ok) {
				actionError = body?.error?.message ?? 'Could not start featuring purchase.';
				return;
			}
			actionMessage = 'Featuring is active — your placement boost follows the fairness rules.';
			await goto('/provider/billing', { invalidateAll: true });
		} catch {
			actionError = 'Could not complete featuring purchase. Check your connection and try again.';
		} finally {
			featuringBusy = false;
		}
	}

	async function cancelFeaturingRenewal() {
		actionError = null;
		actionMessage = null;
		featuringCancelBusy = true;
		try {
			const res = await fetch('/api/billing/featuring/cancel', { method: 'POST' });
			const body = await res.json();
			if (!res.ok) {
				actionError = body?.error?.message ?? 'Could not cancel featuring renewal.';
				return;
			}
			actionMessage =
				'Featuring renewal cancelled. Your boost stays active until the end of your current featuring period.';
			await goto('/provider/billing', { invalidateAll: true });
		} catch {
			actionError = 'Could not cancel featuring renewal. Check your connection and try again.';
		} finally {
			featuringCancelBusy = false;
		}
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-ZA', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Listing billing — Peach Finder</title>
</svelte:head>

<Navigation current="provider" />

<main class="page" data-testid="provider-billing-page">
	<p class="back-row">
		<Button variant="secondary" href="/provider/dashboard">Back to dashboard</Button>
	</p>

	<h1 class="headline">Listing billing</h1>
	<p class="body intro">
		Add a payment method, see prices before you buy, cancel renewal, and download itemized receipts
		— all self-serve.
	</p>

	{#if !data.billing}
		<Card>
			<p class="body">Publish your profile first to manage listing billing.</p>
			<Button variant="primary" href="/provider/onboarding">Continue setup</Button>
		</Card>
	{:else}
		{#if noticeMessage(data.notice) ?? actionMessage}
			<p class="notice body" role="status" data-testid="billing-action-message">
				{noticeMessage(data.notice) ?? actionMessage}
			</p>
		{/if}
		{#if actionError}
			<p class="error label" role="alert" data-testid="billing-action-error">{actionError}</p>
		{/if}

		{#if data.billing.dashboard}
			<ListingBillingStatus billing={data.billing.dashboard} />
		{/if}

		{#if data.billing.state === 'grace' || data.billing.state === 'unpublished'}
			<section class="section" aria-labelledby="pay-listing-heading">
				<h2 id="pay-listing-heading" class="title">Pay for listing</h2>
				<Card>
					<p class="body helper">
						{data.billing.state === 'unpublished'
							? 'Pay now to republish instantly — no review step. This is billing, not moderation.'
							: 'Pay now to stay visible in search after your grace period.'}
					</p>
					<div class="action-row" data-testid="billing-pay-listing">
						<Button
							variant="primary"
							disabled={payBusy || !data.billing.paymentMethod.onFile}
							onclick={payForListing}
						>
							{payBusy ? 'Processing…' : `Pay ${data.price?.listing.amountLabel ?? ''}/month`}
						</Button>
						{#if !data.billing.paymentMethod.onFile}
							<p class="body helper">Add a payment method first.</p>
						{/if}
					</div>
				</Card>
			</section>
		{/if}

		<section class="section" aria-labelledby="payment-method-heading">
			<h2 id="payment-method-heading" class="title">Payment method</h2>
			<Card>
				<p class="body helper">
					Card details are entered on our secure payment partner page — they never pass through
					Peach Finder.
				</p>
				{#if data.billing.paymentMethod.onFile}
					<p class="body payment-on-file" data-testid="billing-payment-on-file">
						<span class="payment-on-file__label">Card on file</span>
						{data.billing.paymentMethod.cardBrand} ending in {data.billing.paymentMethod.cardLast4}
					</p>
					<div class="action-row">
						<Button
							variant="secondary"
							disabled={paymentBusy}
							onclick={addPaymentMethod}
							ariaLabel="Update payment method on secure partner page"
						>
							{paymentBusy ? 'Opening secure page…' : 'Update payment method'}
						</Button>
					</div>
				{:else}
					<div class="action-row" data-testid="billing-add-payment-method">
						<Button
							variant="primary"
							disabled={paymentBusy}
							onclick={addPaymentMethod}
							ariaLabel="Add payment method on secure partner page"
						>
							{paymentBusy ? 'Opening secure page…' : 'Add payment method'}
						</Button>
					</div>
				{/if}
			</Card>
		</section>

		<section class="section" aria-labelledby="featuring-heading">
			<h2 id="featuring-heading" class="title">Featuring add-on</h2>
			<Card>
				<p class="body helper">
					Boost placement within the fairness rules — availability still outranks everything. Requires
					an active listing.
				</p>
				{#if data.billing.featuring.active}
					<p class="body payment-on-file" data-testid="billing-featuring-active">
						<span class="payment-on-file__label">Featuring active</span>
						{#if data.billing.featuring.currentPeriodEndsLabel}
							Renews {data.billing.featuring.currentPeriodEndsLabel} unless cancelled.
						{/if}
					</p>
				{/if}
				<div class="action-row" data-testid="billing-featuring-actions">
					{#if data.billing.featuring.canPurchase}
						<Button variant="primary" disabled={featuringBusy} onclick={buyFeaturing}>
							{featuringBusy
								? 'Processing…'
								: `Add featuring ${data.price?.featuring.amountLabel ?? ''}/month`}
						</Button>
					{:else if !data.billing.featuring.active}
						<p class="body helper">
							{#if !data.billing.paymentMethod.onFile}
								Add a payment method first.
							{:else if data.billing.state === 'grace' || data.billing.state === 'unpublished'}
								Restore your listing before adding featuring.
							{:else}
								Featuring is not available for your current billing state.
							{/if}
						</p>
					{/if}
				</div>
				{#if data.billing.featuring.canCancelRenewal}
					<div class="action-row" data-testid="billing-cancel-featuring-renewal">
						<Button
							variant="secondary"
							disabled={featuringCancelBusy}
							onclick={cancelFeaturingRenewal}
						>
							{featuringCancelBusy ? 'Cancelling…' : 'Cancel featuring renewal at period end'}
						</Button>
					</div>
				{:else if data.billing.featuring.active && data.billing.featuring.cancelAtPeriodEnd}
					<p class="body" data-testid="billing-featuring-renewal-cancelled">
						Featuring renewal is already cancelled. Your boost stays active until
						{data.billing.featuring.currentPeriodEndsLabel ?? 'period end'}.
					</p>
				{/if}
			</Card>
		</section>

		<section class="section" aria-labelledby="pricing-heading">
			<h2 id="pricing-heading" class="title">Prices before you buy</h2>
			<Card>
				<dl class="price-list" data-testid="billing-price-list">
					<div>
						<dt class="label">Listing subscription</dt>
						<dd class="price-value">{data.price?.listing.amountLabel ?? '—'}/month</dd>
					</div>
					<div>
						<dt class="label">Featuring add-on</dt>
						<dd class="price-value">{data.price?.featuring.amountLabel ?? '—'}/month</dd>
					</div>
				</dl>
				<p class="body helper">
					Prices apply to new billing periods. Featuring requires an active listing.
				</p>
			</Card>
		</section>

		{#if data.billing.canCancelRenewal}
			<section class="section" aria-labelledby="cancel-renewal-heading">
				<h2 id="cancel-renewal-heading" class="title">Cancel renewal</h2>
				<Card>
					<p class="body">
						Cancel renewal to stop the next charge. Your listing stays live and discoverable until
						{data.billing.currentPeriodEndsLabel ?? 'the end of your paid period'}, then follows the
						normal grace and unpublish lifecycle.
					</p>
					<div class="action-row" data-testid="billing-cancel-renewal">
						<Button variant="secondary" disabled={cancelBusy} onclick={cancelRenewal}>
							{cancelBusy ? 'Cancelling…' : 'Cancel renewal at period end'}
						</Button>
					</div>
				</Card>
			</section>
		{:else if data.billing.cancelAtPeriodEnd}
			<section class="section" aria-labelledby="cancel-renewal-heading">
				<h2 id="cancel-renewal-heading" class="title">Cancel renewal</h2>
				<Card>
					<p class="body" data-testid="billing-renewal-cancelled">
						Renewal is already cancelled. Your listing stays live until
						{data.billing.currentPeriodEndsLabel ?? 'period end'}.
					</p>
				</Card>
			</section>
		{/if}

		<section class="section" aria-labelledby="history-heading">
			<h2 id="history-heading" class="title">Billing history</h2>
			{#if data.history.length === 0}
				<Card>
					<p class="body" data-testid="billing-history-empty">No receipts yet.</p>
				</Card>
			{:else}
				<ul class="history-list" data-testid="billing-history-list">
					{#each data.history as invoice (invoice.id)}
						<li>
							<Card>
								<div class="history-row">
									<div>
										<p class="history-line label">{invoice.lineItemLabel}</p>
										<p class="body history-meta">
											{formatDate(invoice.issuedAt)}
											{#if invoice.pspInvoiceRef}
												· Ref {invoice.pspInvoiceRef}
											{/if}
										</p>
									</div>
									<div class="history-amount">
										<p class="price-value">{invoice.amountLabel}</p>
										<p class="label history-status">{invoice.statusLabel}</p>
									</div>
								</div>
							</Card>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</main>

<style>
	.page {
		max-width: 40rem;
		margin: 0 auto;
		padding: var(--space-xl) var(--space-md);
		display: grid;
		gap: var(--space-xl);
	}

	.back-row {
		margin: 0;
	}

	.intro,
	.helper {
		margin: 0;
		color: var(--color-stone);
		max-width: 60ch;
	}

	.section {
		display: grid;
		gap: var(--space-md);
	}

	.action-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
		margin-top: var(--space-md);
	}

	.notice {
		margin: 0;
		padding: var(--space-md);
		border-radius: var(--radius-lg);
		background: color-mix(in srgb, var(--color-pine) 10%, var(--color-paper));
		border-left: 4px solid var(--color-pine);
		color: var(--color-ink);
	}

	.error {
		margin: 0;
		color: var(--color-peach-deep);
	}

	.payment-on-file {
		margin: 0;
		display: grid;
		gap: var(--space-xs);
	}

	.payment-on-file__label {
		font-weight: 700;
		color: var(--color-pine);
	}

	.price-list {
		margin: 0;
		display: grid;
		gap: var(--space-md);
	}

	.price-list dt {
		margin: 0;
		color: var(--color-stone);
	}

	.price-list dd {
		margin: var(--space-xs) 0 0;
	}

	.price-value {
		margin: 0;
		font-size: var(--text-title);
		font-weight: 700;
		color: var(--color-peach-deep);
	}

	.history-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-md);
	}

	.history-row {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: var(--space-md);
		align-items: flex-start;
	}

	.history-line {
		margin: 0 0 var(--space-xs);
		color: var(--color-ink);
		font-weight: 700;
	}

	.history-meta {
		margin: 0;
		color: var(--color-stone);
	}

	.history-amount {
		text-align: right;
	}

	.history-status {
		margin: var(--space-xs) 0 0;
		color: var(--color-pine);
	}
</style>
