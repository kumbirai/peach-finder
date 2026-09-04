import type { UserId } from '../../../shared/ids';

export type CapabilitiesDto = {
	userId: UserId;
	isSeeker: boolean;
	isProvider: boolean;
	isAdmin: boolean;
	emailVerified: boolean;
	phoneVerified: boolean;
};
