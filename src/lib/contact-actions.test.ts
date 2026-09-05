import { describe, expect, it } from 'vitest';
import { appendMessageDraftToUrl, messageButtonLabel, resolveCallHref } from './contact-actions';

describe('contact-actions', () => {
	it('resolveCallHref returns tel link when phone is present', () => {
		expect(resolveCallHref('+27821234001')).toBe('tel:+27821234001');
	});

	it('resolveCallHref omits link when phone is absent', () => {
		expect(resolveCallHref(undefined)).toBeUndefined();
		expect(resolveCallHref(null)).toBeUndefined();
		expect(resolveCallHref('')).toBeUndefined();
	});

	it('resolveCallHref uses hash in preview mode', () => {
		expect(resolveCallHref('+27821234001', true)).toBe('#');
	});

	it('messageButtonLabel personalises with first name', () => {
		expect(messageButtonLabel('Amara T.')).toBe('Message Amara');
		expect(messageButtonLabel('  Thandi  ')).toBe('Message Thandi');
		expect(messageButtonLabel('')).toBe('Message');
	});

	it('appendMessageDraftToUrl adds draft to sign-in URLs with existing query params', () => {
		const href =
			'https://example.com/sign-in?returnTo=%2Fprovider%2Fabc&action=message&providerProfileId=abc';
		expect(appendMessageDraftToUrl(href, 'Hi there')).toBe(
			'https://example.com/sign-in?returnTo=%2Fprovider%2Fabc&action=message&providerProfileId=abc&draft=Hi+there'
		);
	});

	it('appendMessageDraftToUrl adds draft to direct compose URLs without query params', () => {
		const href = 'https://example.com/messages/compose/01900000-0000-7000-8000-000000000101';
		expect(appendMessageDraftToUrl(href, 'Hi there')).toBe(
			'https://example.com/messages/compose/01900000-0000-7000-8000-000000000101?draft=Hi+there'
		);
	});
});
