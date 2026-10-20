// Scheduled job handlers and periodic ticks for the reports area. Job kinds are prefixed 'reports.'.
import type { JobHandler, Tick } from './index';

export const reportsJobs: Record<string, JobHandler> = {};
export const reportsTicks: Tick[] = [];
