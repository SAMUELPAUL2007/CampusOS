import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import LogoutButton from "@/components/LogoutButton";

/**
 * Role‑aware dashboard placeholder.
 * Users without a valid session are redirected to /login.
 * The authenticated user's profile (full_name and role) is fetched from
 * `public.profiles` and displayed.
 */
export default async function DashboardPage() {
  // Create a server‑side Supabase client (no response needed here)
  const supabase = await createSupabaseServer();

  // Verify authentication using JWT claims (preferred over getSession())
  const { data: claimsResponse, error: claimsError } = await supabase.auth.getClaims();

  // If we cannot obtain claims (no auth or error), redirect to login
  if (
    claimsError ||
    !claimsResponse?.claims?.sub ||
    typeof claimsResponse.claims.sub !== "string"
  ) {
    redirect("/login");
  }

  const userId = claimsResponse.claims.sub;

  // Fetch the user's profile (id, full_name, role) from the database.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", userId)
    .single();

  // If the profile query fails or returns no data, treat as unauthenticated.
  if (profileError || !profile) {
    redirect("/login");
  }

  // Define the allowed role type – ensures we never trust a stray value.
  type Role = "admin" | "teacher" | "student";
  const role = profile.role as Role;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-card">
        <h1 className="text-xl font-semibold tracking-tight">Welcome to CampusOS</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You are signed in as{" "}
          <span className="font-medium capitalize text-foreground">{role}</span>
          {" — "}{profile.full_name}.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          No dashboard is configured for this role yet.
        </p>
        <div className="mt-6 flex justify-center">
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
