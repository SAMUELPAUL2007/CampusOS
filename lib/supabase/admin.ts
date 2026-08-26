import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase Admin client.
 *
 * - Uses SUPABASE_SERVICE_ROLE_KEY, which MUST never be prefixed with
 *   NEXT_PUBLIC_ and must never be referenced from client components.
 * - Throws a clear server-side error when unconfigured. The thrown message
 *   never contains the secret itself.
 * - The value is read from the environment at call time and is neither
 *   returned nor logged by this module.
 *
 * Only import this module from server code ("use server" actions,
 * route handlers, server components).
 */

let cachedClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error(
      "getSupabaseAdmin() must only be called from server-side code.",
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "User provisioning is not configured: SUPABASE_SERVICE_ROLE_KEY is missing on the server.",
    );
  }

  if (!cachedClient) {
    cachedClient = createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }

  return cachedClient;
}
