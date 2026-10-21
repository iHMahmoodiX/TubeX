// Scheduled jobs and ticks for Channel Insights (e.g. daily snapshots of niche channels). Kinds prefixed 'ci.'.
import type { JobHandler, Tick } from './index';

export const channelInsightsJobs: Record<string, JobHandler> = {};
export const channelInsightsTicks: Tick[] = [];
