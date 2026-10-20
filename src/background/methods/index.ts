// All RPC methods, merged per area. Each area owns its file; method names are prefixed by area.
import { coreMethods } from './core';
import { reportsMethods } from './reports';
import { seoMethods } from './seo';
import { engageMethods } from './engage';
import { inpageMethods } from './inpage';

export const METHODS: Record<string, (...args: any[]) => Promise<unknown>> = { ...coreMethods, ...reportsMethods, ...seoMethods, ...engageMethods, ...inpageMethods };
