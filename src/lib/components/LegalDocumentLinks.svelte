<script lang="ts">
	import {
		PRIVACY_POLICY_LABEL,
		PRIVACY_POLICY_PATH,
		TERMS_OF_SERVICE_LABEL,
		TERMS_OF_SERVICE_PATH
	} from '$lib/legal-documents';
</script>

<nav class="legal-links" aria-label="Legal documents" data-testid="legal-document-links">
	<a class="legal-link" href={TERMS_OF_SERVICE_PATH} data-testid="terms-of-service-link">
		{TERMS_OF_SERVICE_LABEL}
	</a>
	<span class="separator" aria-hidden="true">·</span>
	<a class="legal-link" href={PRIVACY_POLICY_PATH} data-testid="privacy-policy-link">
		{PRIVACY_POLICY_LABEL}
	</a>
</nav>

<style>
	.legal-links {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: var(--space-xs);
	}
	.legal-link {
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
	.legal-link:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
		border-radius: var(--radius-pill);
	}
	.legal-link:hover {
		text-decoration: underline;
	}
	.separator {
		color: var(--color-stone);
	}
</style>
