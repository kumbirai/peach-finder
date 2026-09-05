export type ShareProfileResult = 'shared' | 'copied';

export function canUseNativeShare(): boolean {
	return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export async function copyProfileLink(url: string): Promise<void> {
	if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(url);
			return;
		} catch {
			// Fall through to execCommand for environments that block the async clipboard API.
		}
	}

	if (typeof document === 'undefined') {
		throw new Error('Clipboard API unavailable');
	}

	const textarea = document.createElement('textarea');
	textarea.value = url;
	textarea.setAttribute('readonly', '');
	textarea.style.position = 'fixed';
	textarea.style.left = '-9999px';
	document.body.appendChild(textarea);
	textarea.select();
	const copied = document.execCommand('copy');
	document.body.removeChild(textarea);

	if (!copied) {
		throw new Error('Clipboard API unavailable');
	}
}

/** Opens the OS share sheet when supported; otherwise copies the profile URL to the clipboard. */
export async function shareProfileLink(url: string, title: string): Promise<ShareProfileResult> {
	if (canUseNativeShare()) {
		await navigator.share({ url, title });
		return 'shared';
	}
	await copyProfileLink(url);
	return 'copied';
}
