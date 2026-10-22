// Calls into the background service worker. Used by content scripts (which cannot reach the YouTube APIs,
// the extension database or session tokens directly) and by pages for work that must survive the page.
// Errors keep their class and code so ErrorNotice explains them the same way everywhere.
import { browser } from 'wxt/browser';
import { AiError, type AiErrorCode } from '../integrations/ai/provider';
import { AuthError, type AuthErrorCode } from '../integrations/google/auth';
import { YtError, type YtErrorCode } from '../integrations/youtube/client';

export const RPC = 'tubex/rpc' as const;

export interface RpcRequest {
  type: typeof RPC;
  method: string;
  args: unknown[];
}
export type RpcResponse = { ok: true; value: unknown } | { ok: false; error: SerializedError };
export interface SerializedError {
  kind: 'yt' | 'auth' | 'ai' | 'other';
  code: string;
  detail?: string;
}

export function isRpcRequest(m: unknown): m is RpcRequest {
  const r = m as Partial<RpcRequest> | null;
  return typeof r === 'object' && r !== null && r.type === RPC && typeof r.method === 'string' && r.method.length < 80 && Array.isArray(r.args);
}

export function serializeError(e: unknown): SerializedError {
  if (e instanceof YtError) return { kind: 'yt', code: e.code, detail: e.detail };
  if (e instanceof AuthError) return { kind: 'auth', code: e.code, detail: e.detail };
  if (e instanceof AiError) return { kind: 'ai', code: e.code, detail: e.detail };
  return { kind: 'other', code: 'generic', detail: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300) };
}

export function deserializeError(s: SerializedError): Error {
  if (s.kind === 'yt') return new YtError(s.code as YtErrorCode, s.detail);
  if (s.kind === 'auth') return new AuthError(s.code as AuthErrorCode, s.detail);
  if (s.kind === 'ai') return new AiError(s.code as AiErrorCode, s.detail);
  return new Error(s.detail ?? 'error');
}

export async function rpc<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
  const req: RpcRequest = { type: RPC, method, args };
  const res = (await browser.runtime.sendMessage(req)) as RpcResponse | undefined;
  if (!res) throw new Error(`No response for ${method}`);
  if (!res.ok) throw deserializeError(res.error);
  return res.value as T;
}
