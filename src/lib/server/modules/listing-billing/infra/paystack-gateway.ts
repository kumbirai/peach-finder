import { Err, Ok, type Result, type UseCaseError } from '../../../shared/result';
import { safeFetch } from '../../../shared/http';
import type {
	PaymentAuthorizationResult,
	PaymentAuthorizationSession,
	PaymentGateway
} from '../app/ports';

const PAYSTACK_HOST = 'api.paystack.co';

export class PaystackGateway implements PaymentGateway {
	constructor(private readonly secretKey: string) {}

	async initializeAuthorization(input: {
		email: string;
		callbackUrl: string;
		metadata: { providerProfileId: string; ownerId: string };
	}): Promise<Result<PaymentAuthorizationSession, UseCaseError>> {
		try {
			const reference = `pf_auth_${crypto.randomUUID().replace(/-/g, '')}`;
			const response = await safeFetch(`https://${PAYSTACK_HOST}/transaction/initialize`, {
				method: 'POST',
				timeoutMs: 10_000,
				allowedHosts: [PAYSTACK_HOST],
				headers: {
					Authorization: `Bearer ${this.secretKey}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email: input.email,
					amount: 100,
					currency: 'ZAR',
					reference,
					callback_url: input.callbackUrl,
					metadata: input.metadata,
					channels: ['card']
				})
			});

			if (!response.ok) {
				return Err({ kind: 'unavailable', dependency: 'paystack' });
			}

			const body = (await response.json()) as {
				status?: boolean;
				data?: { authorization_url?: string; reference?: string };
			};

			if (!body.status || !body.data?.authorization_url || !body.data.reference) {
				return Err({ kind: 'unavailable', dependency: 'paystack' });
			}

			return Ok({
				authorizationUrl: body.data.authorization_url,
				reference: body.data.reference
			});
		} catch {
			return Err({ kind: 'unavailable', dependency: 'paystack' });
		}
	}

	async verifyAuthorization(
		reference: string,
		context: { ownerId: string; providerProfileId: string }
	): Promise<Result<PaymentAuthorizationResult, UseCaseError>> {
		try {
			const response = await safeFetch(
				`https://${PAYSTACK_HOST}/transaction/verify/${encodeURIComponent(reference)}`,
				{
					method: 'GET',
					timeoutMs: 10_000,
					allowedHosts: [PAYSTACK_HOST],
					headers: {
						Authorization: `Bearer ${this.secretKey}`
					}
				}
			);

			if (!response.ok) {
				return Err({ kind: 'unavailable', dependency: 'paystack' });
			}

			const body = (await response.json()) as {
				status?: boolean;
				data?: {
					status?: string;
					customer?: { customer_code?: string };
					authorization?: { authorization_code?: string };
					authorization_code?: string;
					metadata?: { ownerId?: string; providerProfileId?: string };
				};
			};

			const metadata = body.data?.metadata;
			if (
				metadata?.ownerId !== context.ownerId ||
				metadata?.providerProfileId !== context.providerProfileId
			) {
				return Err({ kind: 'forbidden', reason: 'payment_authorization_owner_mismatch' });
			}

			if (!body.status || body.data?.status !== 'success') {
				return Err({
					kind: 'precondition_failed',
					reason: 'Payment authorization was not completed.'
				});
			}

			const customerCode = body.data.customer?.customer_code;
			const authorizationCode =
				body.data.authorization?.authorization_code ?? body.data.authorization_code;

			if (!customerCode || !authorizationCode) {
				return Err({ kind: 'unavailable', dependency: 'paystack' });
			}

			return Ok({
				customerCode,
				authorizationCode,
				cardLast4: '••••',
				cardBrand: 'Card'
			});
		} catch {
			return Err({ kind: 'unavailable', dependency: 'paystack' });
		}
	}

	async chargeAuthorization(input: {
		authorizationCode: string;
		customerCode: string;
		amountCents: number;
		metadata: { providerProfileId: string };
	}): Promise<Result<{ reference: string }, UseCaseError>> {
		try {
			const reference = `pf_charge_${crypto.randomUUID().replace(/-/g, '')}`;
			const response = await safeFetch(
				`https://${PAYSTACK_HOST}/transaction/charge_authorization`,
				{
					method: 'POST',
					timeoutMs: 10_000,
					allowedHosts: [PAYSTACK_HOST],
					headers: {
						Authorization: `Bearer ${this.secretKey}`,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						authorization_code: input.authorizationCode,
						email: input.customerCode,
						amount: input.amountCents * 100,
						currency: 'ZAR',
						reference,
						metadata: input.metadata
					})
				}
			);

			if (!response.ok) {
				return Err({ kind: 'unavailable', dependency: 'paystack' });
			}

			const body = (await response.json()) as { status?: boolean };
			if (!body.status) {
				return Err({ kind: 'unavailable', dependency: 'paystack' });
			}

			return Ok({ reference });
		} catch {
			return Err({ kind: 'unavailable', dependency: 'paystack' });
		}
	}
}
