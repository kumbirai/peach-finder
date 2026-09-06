export function formatCount(n: number): string {
	return n < 5 ? '< 5' : String(n);
}

export type MetricTrendPoint = {
	date: string;
	value: string;
};

export type MetricComparison = {
	priorTotal: string;
	changeLabel: string;
	direction: 'up' | 'down' | 'flat';
};

export type DashboardMetricView = {
	currentTotal: string;
	trend: MetricTrendPoint[];
	priorPeriodComparison: MetricComparison;
};

export type MostSearchedServiceView = {
	tagId: string;
	tag: string;
	demandRank: number;
	isMine: boolean;
};

export type ProviderDashboardView = {
	rangeDays: 7 | 30 | 90;
	profileViews: DashboardMetricView;
	searchAppearances: DashboardMetricView;
	contactRequests: DashboardMetricView;
	mostSearchedServices: MostSearchedServiceView[];
	definitions: {
		profileView: string;
		searchAppearance: string;
		contactRequest: string;
	};
};

export function buildComparison(currentCount: number, priorCount: number): MetricComparison {
	if (currentCount === priorCount) {
		return {
			priorTotal: formatCount(priorCount),
			changeLabel: 'Same as prior period',
			direction: 'flat'
		};
	}
	if (priorCount === 0 && currentCount > 0) {
		return {
			priorTotal: formatCount(priorCount),
			changeLabel: 'Up from prior period',
			direction: 'up'
		};
	}
	if (currentCount === 0 && priorCount > 0) {
		return {
			priorTotal: formatCount(priorCount),
			changeLabel: 'Down from prior period',
			direction: 'down'
		};
	}
	const pct = Math.round(((currentCount - priorCount) / priorCount) * 100);
	if (pct > 0) {
		return {
			priorTotal: formatCount(priorCount),
			changeLabel: `Up ${pct}% vs prior period`,
			direction: 'up'
		};
	}
	return {
		priorTotal: formatCount(priorCount),
		changeLabel: `Down ${Math.abs(pct)}% vs prior period`,
		direction: 'down'
	};
}

export function buildTrendPoints(
	dailyCounts: Array<{ day: string; count: number }>
): MetricTrendPoint[] {
	return dailyCounts.map((point) => ({
		date: point.day,
		value: formatCount(point.count)
	}));
}
