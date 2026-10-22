// Sign-in error type, shared by the token flow (auth.ts) and the code flow (codeFlow.ts).
export type AuthErrorCode = 'canceled' | 'denied' | 'permission' | 'state-mismatch' | 'no-channel' | 'expired' | 'network' | 'wrong-channel' | 'server';
export class AuthError extends Error {
  constructor(
    public code: AuthErrorCode,
    public detail?: string,
    /** The channel the error is about, when known (lost over RPC; callers fall back to the active channel). */
    public channelId?: string,
  ) {
    super(code);
  }
}
