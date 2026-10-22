// All RPC methods, merged per area. Each area owns its file; method names are prefixed by area.
import { coreMethods } from './core';
import { reportsMethods } from './reports';
import { seoMethods } from './seo';
import { engageMethods } from './engage';
import { inpageMethods } from './inpage';
import { studioContentMethods } from './studioContent';
import { tagToolsMethods } from './tagTools';
import { channelInsightsMethods } from './channelInsights';
import { launchersMethods } from './launchers';
import { bulkMethods } from './bulk';

export const METHODS: Record<string, (...args: any[]) => Promise<unknown>> = { ...coreMethods, ...reportsMethods, ...seoMethods, ...engageMethods, ...inpageMethods, ...studioContentMethods, ...tagToolsMethods, ...channelInsightsMethods, ...launchersMethods, ...bulkMethods };
