<script lang="ts">
	let {
		activeRole
	}: {
		activeRole: 'seeker' | 'provider' | 'admin' | 'anonymous';
	} = $props();
</script>

<div class="role-switch" role="group" aria-label="Switch role">
	<a
		class="role-btn"
		class:active={activeRole === 'seeker' || activeRole === 'anonymous'}
		href="/messages"
		aria-current={activeRole === 'seeker' ? 'page' : undefined}
	>
		Seeker
	</a>
	<a
		class="role-btn"
		class:active={activeRole === 'provider'}
		href="/provider/dashboard"
		aria-current={activeRole === 'provider' ? 'page' : undefined}
	>
		Provider
	</a>
</div>

<style>
	.role-switch {
		display: flex;
		align-items: center;
		gap: 4px;
		background: var(--color-paper);
		border: 1px solid var(--color-divider);
		border-radius: var(--radius-pill);
		padding: 4px;
		box-shadow: var(--shadow-rest);
	}
	.role-btn {
		border: none;
		border-radius: var(--radius-pill);
		padding: 8px 16px;
		font-family: var(--font-label-family);
		font-size: var(--font-label-size);
		font-weight: 600;
		letter-spacing: var(--font-label-letter-spacing);
		background: transparent;
		color: var(--color-stone);
		text-decoration: none;
		cursor: pointer;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition:
			background 150ms var(--ease-out-expo),
			color 150ms var(--ease-out-expo);
	}
	.role-btn.active {
		background: var(--color-ink);
		color: var(--color-paper);
	}
	.role-btn:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
	}
	@media (prefers-reduced-motion: reduce) {
		.role-btn {
			transition: none;
		}
	}
</style>
