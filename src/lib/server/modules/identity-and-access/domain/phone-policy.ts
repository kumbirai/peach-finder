/** E.164 normalization for South African mobile numbers. */
export function normalizePhoneE164(phone: string): string | null {
	const compact = phone.replace(/[\s()-]/g, '');
	if (/^\+27\d{9}$/.test(compact)) return compact;
	if (/^0\d{9}$/.test(compact)) return `+27${compact.slice(1)}`;
	return null;
}

export function validatePhone(phone: string): string | null {
	const normalized = normalizePhoneE164(phone);
	if (!normalized) {
		return 'Enter a valid South African mobile number (e.g. 082 123 4567).';
	}
	return null;
}

export function maskPhone(phone: string): string {
	if (phone.length < 4) return '••••';
	return `•••• ${phone.slice(-4)}`;
}
