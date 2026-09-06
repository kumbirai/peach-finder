<script lang="ts">
	import {
		PRIVACY_POLICY_LABEL,
		PRIVACY_POLICY_PATH,
		TERMS_OF_SERVICE_LABEL,
		TERMS_OF_SERVICE_PATH
	} from '$lib/legal-documents';
</script>

<span class="label consent-text">
	I accept the
	<a class="consent-link" href={TERMS_OF_SERVICE_PATH} data-testid="terms-of-service-link">
		{TERMS_OF_SERVICE_LABEL}
	</a>
	and
	<a class="consent-link" href={PRIVACY_POLICY_PATH} data-testid="privacy-policy-link">
		{PRIVACY_POLICY_LABEL}
	</a>
</span>

<style>
	.consent-text {
		color: var(--color-ink);
	}
	.consent-link {
		color: var(--color-peach-deep);
		text-decoration: underline;
	}
	.consent-link:focus-visible {
		outline: 2px solid var(--color-peach-deep);
		outline-offset: 2px;
		border-radius: var(--radius-pill);
	}
</style>
