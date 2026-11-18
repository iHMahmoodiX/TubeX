// Supabase Edge Function entry (Deno). Deploy with:
//   supabase functions deploy google-token --no-verify-jwt
// Secrets (Dashboard → Edge Functions → Secrets): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, optional ALLOWED_ORIGINS.
// See server/README.md. This file never logs anything.
import { handle, readEnv } from './handler.ts';

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
};

Deno.serve((req) => handle(req, readEnv((k) => Deno.env.get(k))));
