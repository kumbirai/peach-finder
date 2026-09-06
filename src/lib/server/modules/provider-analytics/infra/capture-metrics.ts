import { log } from '../../../shared/logger';

let captureFailureCount = 0;

export function incrementCaptureFailures(reason: string): void {
	captureFailureCount += 1;
	log('warn', 'analytics capture failed', {
		reason,
		captureFailureCount
	});
}

export function getCaptureFailureCount(): number {
	return captureFailureCount;
}

export async function swallowCapture<T>(label: string, fn: () => Promise<T>): Promise<void> {
	try {
		await fn();
	} catch (error) {
		incrementCaptureFailures(
			error instanceof Error ? `${label}: ${error.message}` : `${label}: unknown`
		);
	}
}
