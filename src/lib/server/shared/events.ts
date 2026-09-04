import type { Instant } from './clock';
import type { OutboxEventId } from './ids';
import type { DomainEventName } from './event-catalog';

export interface DomainEvent<Name extends DomainEventName = DomainEventName, Payload = unknown> {
	eventId: OutboxEventId;
	eventName: Name;
	version: 1;
	occurredAt: Instant;
	payload: Payload;
	correlationId: string;
}

export type ConfigChangedPayload = {
	configKey: string;
	newValue: unknown;
};
