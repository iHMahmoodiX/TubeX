// Scheduled job handlers and periodic ticks for the engage area. Job kinds are prefixed 'engage.'.
import type { JobHandler, Tick } from './index';

export const engageJobs: Record<string, JobHandler> = {};
export const engageTicks: Tick[] = [];
