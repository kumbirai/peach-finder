type Brand<T, B extends string> = T & { readonly __brand: B };

export type Instant = Brand<string, 'Instant'>;

export function asInstant(isoUtc: string): Instant {
	const parsed = Date.parse(isoUtc);
	if (Number.isNaN(parsed)) {
		throw new Error(`Invalid Instant: ${isoUtc}`);
	}
	return new Date(parsed).toISOString() as Instant;
}

export interface Clock {
	now(): Instant;
}

export class SystemClock implements Clock {
	now(): Instant {
		return new Date().toISOString() as Instant;
	}
}

export class FixedClock implements Clock {
	constructor(private t: Instant) {}

	now(): Instant {
		return this.t;
	}

	advance(ms: number): void {
		this.t = new Date(new Date(this.t).getTime() + ms).toISOString() as Instant;
	}
}
