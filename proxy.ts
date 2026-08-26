import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every navigation so that
 * server components always observe the caller's current identity.
 * Without this, rotated access/refresh tokens could leave the browser
 * and server out of sync, making role checks read a stale session.
 */
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not remove. Triggers token refresh when needed.
  await supabase.auth.getClaims();

  // Prevent the browser from caching document-level responses across
  // different authenticated users. Without this, Next.js RSC payloads
  // and document cache can serve stale identity to a different user
  // after account switching (e.g. Admin → Teacher → sees Admin data).
  supabaseResponse.headers.set("Cache-Control", "no-store");

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Run on everything except static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
