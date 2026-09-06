<script lang="ts">
	import LegalDocumentLinks from '$lib/components/LegalDocumentLinks.svelte';
	import { SAFETY_FOOTER_LABEL, SAFETY_PAGE_PATH } from '$lib/trust-badges';
</script>

<footer class="site-footer" data-testid="site-footer">
	<nav class="footer-nav" aria-label="Site">
		<a class="footer-link" href={SAFETY_PAGE_PATH} data-testid="footer-safety-link">
			{SAFETY_FOOTER_LABEL}
		</a>
		<LegalDocumentLinks />
	</nav>
</footer>

<style>
	.site-footer {
		margin-top: auto;
		padding: var(--space-lg) var(--space-md)
			calc(var(--space-xl) + env(safe-area-inset-bottom, 0px));
		border-top: 1px solid var(--color-divider);
		background: var(--color-cream);
	}
	.footer-nav {
		max-width: 56rem;
		margin: 0 auto;
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: var(--space-sm);
	}
	.footer-link {
		font-family: var(--font-label-family);
		font-size: var(--font-label-size);
		font-weight: var(--font-label-weight);
		letter-spacing: var(--font-label-letter-spacing);
		color: var(--color-peach-deep);
		text-decoration: none;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		padding: 0 var(--space-sm);
	}
	.footer-link:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
		border-radius: var(--radius-pill);
	}
	.footer-link:hover {
		text-decoration: underline;
	}
</style>
