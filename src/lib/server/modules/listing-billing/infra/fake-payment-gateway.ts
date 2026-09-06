import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import type {
	PaymentAuthorizationResult,
	PaymentAuthorizationSession,
	PaymentGateway
} from '../app/ports';
import { signFakeWebhookPayload } from './webhook-signature';

type PendingAuthorization = {
	email: string;
	metadata: { providerProfileId: string; ownerId: string };
	completed: boolean;
};

type PendingCharge = {
	providerProfileId: string;
	amountCents: number;
	shouldSucceed: boolean;
	lineItem: 'listing' | 'featuring';
};

const pending = new Map<string, PendingAuthorization>();
const pendingCharges = new Map<string, PendingCharge>();

export class FakePaymentGateway implements PaymentGateway {
	constructor(private readonly appOrigin: string) {}

	async initializeAuthorization(input: {
		email: string;
		callbackUrl: string;
		metadata: { providerProfileId: string; ownerId: string };
	}): Promise<Result<PaymentAuthorizationSession, UseCaseError>> {
		const reference = `fake_auth_${crypto.randomUUID()}`;
		pending.set(reference, {
			email: input.email,
			metadata: input.metadata,
			completed: false
		});

		const callback = new URL(input.callbackUrl);
		callback.searchParams.set('reference', reference);

		return Ok({
			authorizationUrl: `${this.appOrigin}/provider/billing/payment-method/hosted?reference=${encodeURIComponent(reference)}&callback=${encodeURIComponent(callback.toString())}`,
			reference
		});
	}

	async verifyAuthorization(
		reference: string,
		context: { ownerId: string; providerProfileId: string }
	): Promise<Result<PaymentAuthorizationResult, UseCaseError>> {
		const session = pending.get(reference);
		if (!session) {
			return Err({ kind: 'not_found', resource: 'payment_authorization' });
		}
		if (
			session.metadata.ownerId !== context.ownerId ||
			session.metadata.providerProfileId !== context.providerProfileId
		) {
			return Err({ kind: 'forbidden', reason: 'payment_authorization_owner_mismatch' });
		}
		if (!session.completed) {
			return Err({
				kind: 'precondition_failed',
				reason: 'Payment authorization was not completed.'
			});
		}

		return Ok({
			customerCode: `CUS_fake_${session.metadata.providerProfileId.slice(0, 8)}`,
			authorizationCode: `AUTH_fake_${reference.slice(-8)}`,
			cardLast4: '4242',
			cardBrand: 'Visa'
		});
	}

	async chargeAuthorization(input: {
		authorizationCode: string;
		customerCode: string;
		amountCents: number;
		metadata: { providerProfileId: string; lineItem?: 'listing' | 'featuring' };
	}): Promise<Result<{ reference: string }, UseCaseError>> {
		const reference = `fake_charge_${crypto.randomUUID()}`;
		pendingCharges.set(reference, {
			providerProfileId: input.metadata.providerProfileId,
			amountCents: input.amountCents,
			shouldSucceed: true,
			lineItem: input.metadata.lineItem ?? 'listing'
		});
		return Ok({ reference });
	}

	/** Test/dev helper: mark a fake authorization as completed on the hosted page. */
	markCompleted(reference: string): boolean {
		const session = pending.get(reference);
		if (!session) return false;
		session.completed = true;
		return true;
	}

	getPendingCharge(reference: string): PendingCharge | undefined {
		return pendingCharges.get(reference);
	}

	setChargeOutcome(reference: string, shouldSucceed: boolean): boolean {
		const charge = pendingCharges.get(reference);
		if (!charge) return false;
		charge.shouldSucceed = shouldSucceed;
		return true;
	}

	buildWebhookPayload(
		reference: string,
		eventId: string,
		eventType: 'charge.success' | 'charge.failed'
	): { body: string; signature: string } | null {
		const charge = pendingCharges.get(reference);
		if (!charge) return null;
		const body = JSON.stringify({
			id: eventId,
			event: eventType,
			data: {
				reference,
				amount: charge.amountCents * 100,
				metadata: {
					providerProfileId: charge.providerProfileId,
					lineItem: charge.lineItem
				}
			}
		});
		return { body, signature: signFakeWebhookPayload(body) };
	}
}

let fakeGateway: FakePaymentGateway | null = null;

export function getFakePaymentGateway(appOrigin: string): FakePaymentGateway {
	if (!fakeGateway) {
		fakeGateway = new FakePaymentGateway(appOrigin);
	}
	return fakeGateway;
}

export function resetFakePaymentGateway(): void {
	fakeGateway = null;
	pending.clear();
	pendingCharges.clear();
}
