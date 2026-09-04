export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;

export function generateOtpCode(): string {
	const value = Math.floor(Math.random() * 1_000_000);
	return value.toString().padStart(OTP_LENGTH, '0');
}
