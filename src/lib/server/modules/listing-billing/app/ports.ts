import type { Result, UseCaseError } from '../../../shared/result';

export type PaymentAuthorizationSession = {
	authorizationUrl: string;
	reference: string;
};

export type PaymentAuthorizationResult = {
	customerCode: string;
	authorizationCode: string;
	cardLast4: string;
	cardBrand: string;
};

export interface PaymentGateway {
	initializeAuthorization(input: {
		email: string;
		callbackUrl: string;
		metadata: { providerProfileId: string; ownerId: string };
	}): Promise<Result<PaymentAuthorizationSession, UseCaseError>>;

	verifyAuthorization(
		reference: string,
		context: { ownerId: string; providerProfileId: string }
	): Promise<Result<PaymentAuthorizationResult, UseCaseError>>;

	chargeAuthorization(input: {
		authorizationCode: string;
		customerCode: string;
		amountCents: number;
		metadata: { providerProfileId: string; lineItem?: 'listing' | 'featuring' };
	}): Promise<Result<{ reference: string }, UseCaseError>>;
}
