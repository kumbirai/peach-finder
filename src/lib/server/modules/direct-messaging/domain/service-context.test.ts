import { describe, expect, it } from 'vitest';
import { formatServiceContextDraft, resolveComposerDraft } from './service-context';

describe('service-context', () => {
	it('formatServiceContextDraft wraps the service name', () => {
		expect(formatServiceContextDraft('60 min deep tissue')).toBe('Re: 60 min deep tissue');
		expect(formatServiceContextDraft('  Sports massage  ')).toBe('Re: Sports massage');
		expect(formatServiceContextDraft('   ')).toBe('');
	});

	it('resolveComposerDraft prefers draft param over service context', () => {
		expect(
			resolveComposerDraft({
				draftParam: 'Custom draft',
				serviceContextParam: 'Deep tissue',
				pendingBody: null,
				hasExistingThread: false
			})
		).toBe('Custom draft');
	});

	it('resolveComposerDraft ignores draft and service context when thread exists', () => {
		expect(
			resolveComposerDraft({
				draftParam: 'Still in URL from session draft',
				serviceContextParam: 'Deep tissue',
				pendingBody: null,
				hasExistingThread: true
			})
		).toBe('');
	});

	it('resolveComposerDraft uses service context only for new threads', () => {
		expect(
			resolveComposerDraft({
				draftParam: null,
				serviceContextParam: '60 minute session',
				pendingBody: null,
				hasExistingThread: false
			})
		).toBe('Re: 60 minute session');
	});
});
