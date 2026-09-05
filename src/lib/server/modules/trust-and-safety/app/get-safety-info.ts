import { getConfig } from '../../platform-configuration';

export type SafetyInfo = {
	html: string;
};

export function getSafetyInfo(): SafetyInfo {
	return { html: getConfig('platform-configuration.safety_info_html') };
}
