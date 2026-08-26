import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client factory.
 *
 * Uses the canonical @supabase/ssr cookie pattern for Next.js App Router:
 * - `getAll` reads auth cookies for every request.
 * - `setAll` writes rotated tokens back. Cookie writes are only allowed
 *   in Server Actions and Route Handlers, so the write is wrapped in
 *   try/catch for Server Component renders (Supabase docs pattern).
 *   The `proxy.ts` file performs the actual refresh on navigation, so
 *   sessions stay in sync between browser and server.
 *
 * Only the public anon key is used here — no secrets.
 */
export const createSupabaseServer = async () => {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component render — safe to ignore.
            // proxy.ts refreshes sessions on navigation instead.
          }
        },
      },
    },
  );
};
