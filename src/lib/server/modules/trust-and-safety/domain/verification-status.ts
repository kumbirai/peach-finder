export type VerificationOwnerStatus = 'never_submitted' | 'pending' | 'approved' | 'rejected';

export type VerificationOwnerView = {
	status: VerificationOwnerStatus;
	submittedAt: string | null;
	decidedAt: string | null;
	rejectionReason: string | null;
	caseId: string | null;
};
