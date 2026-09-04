import { v7 as uuidv7 } from 'uuid';

type Brand<T, B extends string> = T & { readonly __brand: B };

export type UserId = Brand<string, 'UserId'>;
export type ProviderProfileId = Brand<string, 'ProviderProfileId'>;
export type PhotoId = Brand<string, 'PhotoId'>;
export type ServiceId = Brand<string, 'ServiceId'>;
export type ServiceTagId = Brand<string, 'ServiceTagId'>;
export type AreaId = Brand<string, 'AreaId'>;
export type AvailabilityEventId = Brand<string, 'AvailabilityEventId'>;
export type ThreadId = Brand<string, 'ThreadId'>;
export type MessageId = Brand<string, 'MessageId'>;
export type ReviewId = Brand<string, 'ReviewId'>;
export type VerificationCaseId = Brand<string, 'VerificationCaseId'>;
export type ReportId = Brand<string, 'ReportId'>;
export type ModerationActionId = Brand<string, 'ModerationActionId'>;
export type BlockId = Brand<string, 'BlockId'>;
export type SubscriptionId = Brand<string, 'SubscriptionId'>;
export type InvoiceId = Brand<string, 'InvoiceId'>;
export type NotificationId = Brand<string, 'NotificationId'>;
export type AnalyticsEventId = Brand<string, 'AnalyticsEventId'>;
export type AuditLogEntryId = Brand<string, 'AuditLogEntryId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type OtpId = Brand<string, 'OtpId'>;
export type OutboxEventId = Brand<string, 'OutboxEventId'>;
export type LexiconEntryId = Brand<string, 'LexiconEntryId'>;

export const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class InvalidIdError extends Error {
	constructor(raw: string) {
		super(`Invalid UUIDv7: ${raw}`);
		this.name = 'InvalidIdError';
	}
}

export function newId<T extends string>(): Brand<string, T> {
	return uuidv7() as Brand<string, T>;
}

export function asId<T extends string>(raw: string): Brand<string, T> {
	if (!UUID_V7_RE.test(raw)) throw new InvalidIdError(raw);
	return raw as Brand<string, T>;
}
