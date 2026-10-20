// Typed messages between extension pages and the YouTube content script.
export const PAGE_CONTEXT_REQUEST = 'tubex/page-context' as const;

export interface PageContextRequest {
  type: typeof PAGE_CONTEXT_REQUEST;
}

export interface PageContextResponse {
  url: string;
  adapterVersion: string;
  title?: string;
  channelName?: string;
}

export function isPageContextRequest(msg: unknown): msg is PageContextRequest {
  return typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === PAGE_CONTEXT_REQUEST;
}

export function isPageContextResponse(v: unknown): v is PageContextResponse {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  const optStr = (x: unknown) => x === undefined || (typeof x === 'string' && x.length <= 1000);
  return typeof r.url === 'string' && typeof r.adapterVersion === 'string' && optStr(r.title) && optStr(r.channelName);
}
