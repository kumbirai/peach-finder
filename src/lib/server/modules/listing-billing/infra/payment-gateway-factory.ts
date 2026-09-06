import type { PaymentGateway } from '../app/ports';
import { getFakePaymentGateway } from './fake-payment-gateway';
import { PaystackGateway } from './paystack-gateway';

export function createPaymentGateway(appOrigin: string): PaymentGateway {
	const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim();
	if (secretKey) {
		return new PaystackGateway(secretKey);
	}
	return getFakePaymentGateway(appOrigin);
}

export { getFakePaymentGateway };
