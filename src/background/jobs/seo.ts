// Scheduled job handlers and periodic ticks for the seo area. Job kinds are prefixed 'seo.'.
import type { JobHandler, Tick } from './index';

export const seoJobs: Record<string, JobHandler> = {};
export const seoTicks: Tick[] = [];
