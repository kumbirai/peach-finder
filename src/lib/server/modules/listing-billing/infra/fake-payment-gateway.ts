import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import type {
	PaymentAuthorizationResult,
	PaymentAuthorizationSession,
	PaymentGateway
} from '../app/ports';

type PendingAuthorization = {
	email: string;
	metadata: { providerProfileId: string; ownerId: string };
	completed: boolean;
};

const pending = new Map<string, PendingAuthorization>();

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

	/** Test/dev helper: mark a fake authorization as completed on the hosted page. */
	markCompleted(reference: string): boolean {
		const session = pending.get(reference);
		if (!session) return false;
		session.completed = true;
		return true;
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
}
