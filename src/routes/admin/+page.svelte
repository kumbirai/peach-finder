<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import { queueAgeSubLabel } from '$lib/admin/ops-kpi-format';

	let { data } = $props();
</script>

<main class="admin-panel admin-panel--top" data-testid="admin-ops-dashboard">
	<h1 class="headline">Ops dashboard</h1>
	<p class="body">
		Queue depth, registration pace, and live listings — the manual-review scaling risk (BRD risk #2)
		visible before it lands.
	</p>

	<div class="kpi-row" aria-label="Platform operations summary">
		<div class="kpi-tile" data-testid="kpi-identity-queue">
			<div class="kpi-label">Identity queue</div>
			<div class="kpi-value">{data.kpis.identityQueue.pendingCount}</div>
			<div class="kpi-sub">
				pending · {queueAgeSubLabel(data.kpis.identityQueue.avgAgeHours, 'no pending cases')}
			</div>
		</div>
		<div class="kpi-tile" data-testid="kpi-reports-queue">
			<div class="kpi-label">Reports queue</div>
			<div class="kpi-value">{data.kpis.reportsQueue.openCount}</div>
			<div class="kpi-sub">
				open · {queueAgeSubLabel(data.kpis.reportsQueue.avgAgeHours, 'no open reports')}
			</div>
		</div>
		<div class="kpi-tile" data-testid="kpi-registrations">
			<div class="kpi-label">New registrations</div>
			<div class="kpi-value">{data.kpis.registrations.count}</div>
			<div class="kpi-sub">{data.kpis.registrationRangeLabel}</div>
		</div>
		<div class="kpi-tile" data-testid="kpi-active-listings">
			<div class="kpi-label">Active listings</div>
			<div class="kpi-value">{data.kpis.activeListings}</div>
			<div class="kpi-sub">live now</div>
		</div>
	</div>

	<h2 class="section-title">Console sections</h2>
	<ul class="links">
		<li><a href="/admin/identity">Identity queue</a></li>
		<li><a href="/admin/reports">Reports queue</a></li>
		<li><a href="/admin/accounts">Account lookup</a></li>
		<li><a href="/admin/moderation">Moderation actions</a></li>
		<li><a href="/admin/config">Platform config</a></li>
		<li><a href="/admin/audit">Audit log</a></li>
	</ul>
	<form method="POST" action="/api/identity/logout?returnTo=/admin/login">
		<Button type="submit" variant="secondary">Sign out</Button>
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
		max-width: 42rem;
	}

	.kpi-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: var(--space-md);
		margin: var(--space-lg) 0;
	}

	@media (min-width: 768px) {
		.kpi-row {
			grid-template-columns: repeat(4, 1fr);
		}
	}

	.kpi-tile {
		background: var(--color-paper);
		border-radius: var(--radius-md);
		padding: var(--space-md);
		box-shadow: var(--shadow-rest);
	}

	.kpi-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-stone);
		letter-spacing: 0.02em;
	}

	.kpi-value {
		font-family: var(--font-display-family);
		font-size: 1.625rem;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		margin-top: 2px;
	}

	.kpi-sub {
		font-size: 0.75rem;
		color: var(--color-stone);
		margin-top: 2px;
	}

	.section-title {
		font-size: 0.875rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-stone);
		margin: var(--space-xl) 0 var(--space-sm);
	}

	.links {
		margin: 0 0 var(--space-lg);
		padding-left: var(--space-lg);
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.links a {
		color: var(--color-peach-deep);
		font-weight: 600;
		text-decoration: none;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}

	.links a:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
		border-radius: var(--radius-pill);
	}
</style>
