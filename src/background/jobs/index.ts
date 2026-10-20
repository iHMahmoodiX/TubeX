// Job handlers and periodic ticks, merged per area. A handler returns a short human-readable result.
import type { Job } from '../../storage/stores';
import { reportsJobs, reportsTicks } from './reports';
import { seoJobs, seoTicks } from './seo';
import { engageJobs, engageTicks } from './engage';

export type JobHandler = (job: Job) => Promise<string>;
export type Tick = (now: Date) => Promise<void>;

export const JOB_HANDLERS: Record<string, JobHandler> = { ...reportsJobs, ...seoJobs, ...engageJobs };
export const TICKS: Tick[] = [...reportsTicks, ...seoTicks, ...engageTicks];
