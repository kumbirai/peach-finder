document.addEventListener(
	'click',
	(event) => {
		const target = event.target;
		if (!(target instanceof Element)) return;
		const anchor = target.closest('[data-message-draft-key]');
		if (!(anchor instanceof HTMLAnchorElement)) return;
		const key = anchor.dataset.messageDraftKey;
		if (!key) return;
		const draft = sessionStorage.getItem(key);
		if (!draft) return;
		event.preventDefault();
		window.location.assign(`${anchor.href}&draft=${encodeURIComponent(draft)}`);
	},
	true
);
