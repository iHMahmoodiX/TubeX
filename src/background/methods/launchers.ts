// RPC methods for In-page launchers (edge tab, top-bar buttons), the TubeX drawer and the watch-page Videolytics panel. Arguments from content scripts are validated.
export const launchersMethods: Record<string, (...args: any[]) => Promise<unknown>> = {};
