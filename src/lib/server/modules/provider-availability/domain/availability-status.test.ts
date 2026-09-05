import { describe, expect, it } from 'vitest';
import { asId } from '../../../shared/ids';
import { asInstant } from '../../../shared/clock';
import {
	clear,
	discoveryAvailabilityState,
	expire,
	setAvailable,
	warn,
	windowInWarnBand,
	windowIsOverdue,
	type AvailabilityStatus
} from './availability-status';

const profileId = asId<'ProviderProfileId'>('01920000-0000-7000-8000-000000000001');
const now = asInstant('2026-09-05T10:00:00Z');
const expiresAt = asInstant('2026-09-05T14:00:00Z');

describe('availability-status domain', () => {
	it('set from NotAvailable records history type set', () => {
		const status: AvailabilityStatus = { kind: 'NotAvailable', providerProfileId: profileId };
		const result = setAvailable(status, now, expiresAt);
		expect(result.historyType).toBe('set');
		expect(result.next.kind).toBe('Available');
		expect(result.next.setAt).toEqual(now);
		expect(result.next.expiresAt).toEqual(expiresAt);
	});

	it('set from Available records history type renewed', () => {
		const status: AvailabilityStatus = {
			kind: 'Available',
			providerProfileId: profileId,
			setAt: asInstant('2026-09-05T08:00:00Z'),
			expiresAt: asInstant('2026-09-05T12:00:00Z')
		};
		const result = setAvailable(status, now, expiresAt);
		expect(result.historyType).toBe('renewed');
		expect(result.next.setAt).toEqual(now);
	});

	it('clear from NotAvailable is a noop', () => {
		const status: AvailabilityStatus = { kind: 'NotAvailable', providerProfileId: profileId };
		expect(clear(status).ok).toBe(false);
	});

	it('clear from Available yields NotAvailable', () => {
		const status: AvailabilityStatus = {
			kind: 'Available',
			providerProfileId: profileId,
			setAt: now,
			expiresAt
		};
		const result = clear(status);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.kind).toBe('NotAvailable');
		}
	});

	it('clear from ExpiryWarned yields NotAvailable', () => {
		const status: AvailabilityStatus = {
			kind: 'ExpiryWarned',
			providerProfileId: profileId,
			setAt: now,
			expiresAt,
			warnedAt: asInstant('2026-09-05T13:45:00Z')
		};
		const result = clear(status);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.kind).toBe('NotAvailable');
		}
	});

	it('ExpiryWarned collapses to available for discovery', () => {
		const status: AvailabilityStatus = {
			kind: 'ExpiryWarned',
			providerProfileId: profileId,
			setAt: now,
			expiresAt,
			warnedAt: asInstant('2026-09-05T13:45:00Z')
		};
		expect(discoveryAvailabilityState(status)).toBe('available');
	});

	it('windowIsOverdue is true when expiresAt <= now', () => {
		expect(windowIsOverdue(expiresAt, expiresAt)).toBe(true);
		expect(windowIsOverdue(expiresAt, asInstant('2026-09-05T15:00:00Z'))).toBe(true);
		expect(windowIsOverdue(expiresAt, asInstant('2026-09-05T13:59:59Z'))).toBe(false);
	});

	it('windowInWarnBand matches the lead-time band', () => {
		const bandNow = asInstant('2026-09-05T13:46:00Z');
		expect(windowInWarnBand(expiresAt, bandNow, 15)).toBe(true);
		expect(windowInWarnBand(expiresAt, asInstant('2026-09-05T10:00:00Z'), 15)).toBe(false);
		expect(windowInWarnBand(expiresAt, asInstant('2026-09-05T14:00:01Z'), 15)).toBe(false);
	});

	it('warn transitions Available to ExpiryWarned', () => {
		const status: AvailabilityStatus = {
			kind: 'Available',
			providerProfileId: profileId,
			setAt: now,
			expiresAt
		};
		const warned = warn(status, asInstant('2026-09-05T13:45:00Z'));
		expect(warned.kind).toBe('ExpiryWarned');
		expect(warned.warnedAt).toBe(asInstant('2026-09-05T13:45:00Z'));
	});

	it('expire transitions live states to NotAvailable', () => {
		const status: AvailabilityStatus = {
			kind: 'ExpiryWarned',
			providerProfileId: profileId,
			setAt: now,
			expiresAt,
			warnedAt: asInstant('2026-09-05T13:45:00Z')
		};
		expect(expire(status)).toEqual({ kind: 'NotAvailable', providerProfileId: profileId });
	});
});
